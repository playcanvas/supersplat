// Tile lists contain projected splats, sorted by positive camera-space depth.
// There is no fixed per-tile splat limit: a prefix sum assigns padded regions,
// and the owner grows the list buffer before a capture is accepted.
const DEPTH_TILE_SIZE = 8;

const depthComputeShader = (stage: string) => /* wgsl */ `
struct Params {
    width: u32, height: u32, tilesX: u32, tilesY: u32,
    cacheWidth: u32, capacity: u32, listCapacity: u32, method: u32,
    minOpacity: f32, minContribution: f32, minCoverage: f32, quantile: f32,
    near: f32, far: f32, rangeNear: f32, rangeFar: f32,
    rangeMode: u32, rangePad0: u32, rangePad1: u32, rangePad2: u32
}
@group(0) @binding(0) var cacheA: texture_2d<u32>;
@group(0) @binding(1) var cacheB: texture_2d<u32>;
@group(0) @binding(2) var<storage, read> entries: array<u32>;
@group(0) @binding(3) var<storage, read> splatCount: array<u32>;
@group(0) @binding(4) var<storage, read_write> counts: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> ranges: array<vec2u>;
@group(0) @binding(6) var<storage, read_write> nodes: array<vec2u>;
@group(0) @binding(7) var<storage, read_write> stats: array<atomic<u32>>;
@group(0) @binding(8) var rawDepth: texture_storage_2d<rgba32uint, write>;
@group(0) @binding(9) var<storage, read_write> histogram: array<atomic<u32>>;
@group(0) @binding(10) var rawInput: texture_2d<u32>;
@group(0) @binding(11) var<uniform> params: Params;
var<workgroup> sharedRange: vec2u;
var<workgroup> sortScratch: array<vec2u,1024>;

const TILE = ${DEPTH_TILE_SIZE}u;
const EMPTY = 0xffffffffu;
fn uv(entry: u32) -> vec2i { return vec2i(i32(entry % params.cacheWidth), i32(entry / params.cacheWidth)); }
fn alphaOf(entry: u32) -> f32 { return f32((textureLoad(cacheB, uv(entry), 0).x >> 16u) & 255u) / 255.0; }
fn axes(a: vec4u, b: u32) -> mat2x2f {
    let x = unpack2x16float(a.w);
    let y = unpack2x16float(b).x * normalize(vec2f(x.y, -x.x));
    return mat2x2f(vec2f(x.x, -x.y), vec2f(y.x, -y.y));
}
fn center(a: vec4u) -> vec2f {
    let viewport = vec2f(f32(params.width), f32(params.height));
    let radius = min(1024.0, min(viewport.x, viewport.y));
    let ndc = unpack2x16snorm(a.x) * (vec2f(1.0) + vec2f(4.0 * radius) / viewport);
    return (ndc * vec2f(0.5, -0.5) + vec2f(0.5)) * viewport;
}
fn bounds(entry: u32) -> vec4i {
    let a = textureLoad(cacheA, uv(entry), 0);
    let b = textureLoad(cacheB, uv(entry), 0).x;
    let depth = bitcast<f32>(a.y);
    if (alphaOf(entry) < params.minOpacity) { return vec4i(1,1,0,0); }
    let ax = axes(a, b);
    // Bound only the footprint capable of passing the pixel contribution cutoff.
    let alpha = f32((b >> 16u) & 255u) / 255.0;
    let cutoff = max(params.minContribution, 1.0/255.0);
    if (alpha < cutoff) { return vec4i(1,1,0,0); }
    let radius = sqrt(clamp(-log(exp(-4.0) + cutoff / alpha * (1.0-exp(-4.0))) / 4.0, 0.0, 1.0));
    let extent = sqrt(ax[0]*ax[0] + ax[1]*ax[1]) * radius + vec2f(1e-3);
    let c = center(a);
    let lo = vec2i(floor((c - extent) / f32(TILE)));
    let hi = vec2i(floor((c + extent) / f32(TILE)));
    return vec4i(max(lo,vec2i(0)), min(hi,vec2i(i32(params.tilesX)-1,i32(params.tilesY)-1)));
}
fn sortKey(z: f32) -> u32 { let bits=bitcast<u32>(z); return select(bits ^ 0x80000000u,~bits,(bits & 0x80000000u)!=0u); }
fn fromKey(key: u32) -> f32 { return bitcast<f32>(select(~key,key ^ 0x80000000u,(key & 0x80000000u)!=0u)); }
fn pow2(value: u32) -> u32 {
    if (value == 0u) { return 0u; }
    return 1u << (32u - countLeadingZeros(value - 1u));
}

${
    stage === 'count' || stage === 'scatter'
        ? /* wgsl */ `
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let index = id.x + id.y * 65535u * 128u;
    if(index >= splatCount[0]) { return; }
    let entry = entries[index];
    let box = bounds(entry);
    for(var y=box.y;y<=box.w;y++) { for(var x=box.x;x<=box.z;x++) {
        let tile = u32(y)*params.tilesX+u32(x);
        let slot = atomicAdd(&counts[tile],1u);
        ${
            stage === 'scatter'
                ? /* wgsl */ `
        let range = ranges[tile];
        if(range.x + pow2(range.y) <= params.listCapacity) {
            let bits=textureLoad(cacheA,uv(entry),0).y;
            let key=select(bits ^ 0x80000000u,~bits,(bits & 0x80000000u)!=0u);
            nodes[range.x+slot] = vec2u(key,entry);
        }
        `
                : ''
        }
    }}
}
`
        : ''
}
${
    stage === 'reset'
        ? /* wgsl */ `
@compute @workgroup_size(1)
fn main() {
    atomicStore(&stats[0],0u);
    atomicStore(&stats[1],EMPTY); atomicStore(&stats[2],0u); atomicStore(&stats[3],0u);
}
`
        : ''
}
${
    stage === 'prefix'
        ? /* wgsl */ `
var<workgroup> prefix: array<u32,128>;
var<workgroup> base: u32;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) thread: u32) {
    let tile=id.x;
    var count=0u; var padded=0u;
    if(tile<params.tilesX*params.tilesY){count=atomicLoad(&counts[tile]);padded=pow2(count);}
    prefix[thread]=padded;
    workgroupBarrier();
    for(var step=1u;step<128u;step*=2u){
        var add=0u;
        if(thread>=step){add=prefix[thread-step];}
        workgroupBarrier();
        prefix[thread]+=add;
        workgroupBarrier();
    }
    if(thread==127u){base=atomicAdd(&stats[0],prefix[127]);}
    let start=workgroupUniformLoad(&base);
    if(tile<params.tilesX*params.tilesY){
        ranges[tile]=vec2u(start+prefix[thread]-padded,count);
        atomicStore(&counts[tile],0u);
    }
}
`
        : ''
}
${
    stage === 'init' || stage === 'sort'
        ? /* wgsl */ `
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) group: vec3u, @builtin(local_invocation_index) thread: u32) {
    let tile=group.y*params.tilesX+group.x;
    if(thread==0u){sharedRange=ranges[tile];}
    let range=workgroupUniformLoad(&sharedRange);
    let n=pow2(range.y);
    if(range.x+n>params.listCapacity){return;}
    ${
        stage === 'init'
            ? /* wgsl */ `
    for(var i=thread;i<n;i+=64u){ nodes[range.x+i]=vec2u(EMPTY,EMPTY); }
    `
            : /* wgsl */ `
    // Most tiles fit entirely in workgroup memory. Keep the unbounded global
    // fallback for dense tiles instead of truncating their contributions.
    if(n<=1024u){
        for(var i=thread;i<n;i+=64u){sortScratch[i]=nodes[range.x+i];}
        workgroupBarrier();
        for(var k=2u;k<=n;k*=2u){for(var j=k/2u;j>0u;j/=2u){
            for(var i=thread;i<n;i+=64u){
                let other=i^j;
                if(other>i){
                    let a=sortScratch[i];let b=sortScratch[other];
                    let greater=a.x>b.x || (a.x==b.x && a.y>b.y);
                    let less=a.x<b.x || (a.x==b.x && a.y<b.y);
                    if(select(less,greater,(i&k)==0u)){sortScratch[i]=b;sortScratch[other]=a;}
                }
            }
            workgroupBarrier();
        }}
        for(var i=thread;i<n;i+=64u){nodes[range.x+i]=sortScratch[i];}
        return;
    }
    for(var k=2u;k<=n;k*=2u) {
        for(var j=k/2u;j>0u;j/=2u) {
            for(var i=thread;i<n;i+=64u) {
                let other=i^j;
                if(other>i) {
                    let a=nodes[range.x+i]; let b=nodes[range.x+other];
                    let greater=a.x>b.x || (a.x==b.x && a.y>b.y);
                    let less=a.x<b.x || (a.x==b.x && a.y<b.y);
                    if(select(less,greater,(i&k)==0u)) {
                        nodes[range.x+i]=b; nodes[range.x+other]=a;
                    }
                }
            }
            storageBarrier(); workgroupBarrier();
        }
    }
    `
    }
}
`
        : ''
}
${
    stage === 'resolve'
        ? /* wgsl */ `
struct ProjectedGaussian {
    center: vec2f,
    inverseX: vec2f,
    inverseY: vec2f,
    depth: f32,
    alpha: f32
}
var<workgroup> batch: array<ProjectedGaussian,64>;
var<workgroup> zmin: atomic<u32>;
var<workgroup> zmax: atomic<u32>;
var<workgroup> validCount: atomic<u32>;
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id: vec3u,
        @builtin(workgroup_id) group: vec3u,
        @builtin(local_invocation_index) thread: u32) {
    // An 8x8 pixel group owns a tile and reuses each decoded Gaussian across
    // all 64 pixels, including partially filled tiles on the viewport edge.
    if(thread==0u){
        sharedRange=ranges[group.y*params.tilesX+group.x];
        atomicStore(&zmin,EMPTY);atomicStore(&zmax,0u);atomicStore(&validCount,0u);
    }
    let range=workgroupUniformLoad(&sharedRange);
    let inside=id.x<params.width && id.y<params.height;
    let p=vec2i(id.xy);
    if(inside){textureStore(rawDepth,p,vec4u(0u));}
    if(range.x+pow2(range.y)>params.listCapacity){return;}
    var transmittance=1.0;
    var sum=0.0; var median=0.0; var crossed=false; var found=false;
    var done=!inside;
    for(var start=0u;start<range.y;start+=64u){
        let slot=start+thread;
        if(slot<range.y){
            let node=nodes[range.x+slot];
            let a=textureLoad(cacheA,uv(node.y),0);let b=textureLoad(cacheB,uv(node.y),0).x;
            let ax=axes(a,b);
            let determinant=ax[0].x*ax[1].y-ax[1].x*ax[0].y;
            batch[thread].center=center(a);
            batch[thread].inverseX=vec2f(ax[1].y,-ax[1].x)/determinant;
            batch[thread].inverseY=vec2f(-ax[0].y,ax[0].x)/determinant;
            batch[thread].depth=bitcast<f32>(a.y);
            batch[thread].alpha=select(f32((b>>16u)&255u)/255.0,0.0,abs(determinant)<1e-10);
        }
        workgroupBarrier();
        if(!done){
            for(var i=0u;i<min(64u,range.y-start);i++){
                let g=batch[i];
                if(g.alpha==0.0){continue;}
                let delta=vec2f(id.xy)+vec2f(0.5)-g.center;
                let local=vec2f(dot(delta,g.inverseX),dot(delta,g.inverseY));
                let radius=dot(local,local);
                if(radius>1.0){continue;}
                let alpha=clamp(g.alpha*max(0.0,(exp(-4.0*radius)-exp(-4.0))/(1.0-exp(-4.0))),0.0,1.0);
                if(alpha<params.minContribution || alpha<1.0/255.0){continue;}
                let depth=clamp(g.depth,params.near,params.far);
                found=true;
                sum+=depth*alpha*transmittance;
                let next=transmittance*(1.0-alpha);
                if(!crossed && 1.0-next>=params.quantile){median=depth;crossed=true;}
                transmittance=next;
                if(transmittance<1e-4){done=true;break;}
            }
        }
        workgroupBarrier();
    }
    let coverage=1.0-transmittance;
    // Method 0 is alpha-weighted mean; method 1 is the opacity quantile.
    var depth=sum/max(coverage,1e-8);
    var valid=inside && found && coverage>=params.minCoverage;
    if(params.method==1u){depth=median;valid=valid && crossed;}
    if(inside){textureStore(rawDepth,p,vec4u(bitcast<u32>(depth),bitcast<u32>(coverage),0u,select(0u,1u,valid)));}
    if(params.rangeMode==0u){
        if(valid){atomicMin(&zmin,sortKey(depth));atomicMax(&zmax,sortKey(depth));atomicAdd(&validCount,1u);}
        workgroupBarrier();
        if(thread==0u){
            atomicMin(&stats[1],atomicLoad(&zmin));atomicMax(&stats[2],atomicLoad(&zmax));
            atomicAdd(&stats[3],atomicLoad(&validCount));
        }
    }
}
`
        : ''
}

${
    stage === 'histogram'
        ? /* wgsl */ `
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if(id.x>=params.width || id.y>=params.height){return;}
    let raw=textureLoad(rawInput,vec2i(id.xy),0);
    if(raw.w==0u){return;}
    let lo=fromKey(atomicLoad(&stats[1]));let hi=fromKey(atomicLoad(&stats[2]));
    let bin=u32(clamp((bitcast<f32>(raw.x)-lo)/max(hi-lo,1e-8),0.0,1.0)*1023.0);
    atomicAdd(&histogram[bin],1u);
}
`
        : ''
}
${
    stage === 'range'
        ? /* wgsl */ `
@compute @workgroup_size(1)
fn main() {
    var lo=params.rangeNear;var hi=params.rangeFar;
    let count=atomicLoad(&stats[3]);
    if(params.rangeMode==0u && count>0u) {
        let zmin=fromKey(atomicLoad(&stats[1]));let zmax=fromKey(atomicLoad(&stats[2]));
        var sum=0u; var lowBin=0u;var highBin=1023u;var found=false;
        for(var b=0u;b<1024u;b++) {
            sum+=atomicLoad(&histogram[b]);
            if(!found && f32(sum)>=f32(count)*0.02){lowBin=b;found=true;}
            if(f32(sum)>=f32(count)*0.98){highBin=b;break;}
        }
        lo=mix(zmin,zmax,f32(lowBin)/1024.0);
        hi=mix(zmin,zmax,f32(highBin+1u)/1024.0);
    }
    hi=max(hi,lo+max(abs(lo)*1e-5,1e-4));
    atomicStore(&stats[4],bitcast<u32>(lo));atomicStore(&stats[5],bitcast<u32>(hi));
}
`
        : ''
}

${
    stage === 'smooth'
        ? /* wgsl */ `
fn sampleAt(p: vec2i) -> vec4u {
    return textureLoad(rawInput,clamp(p,vec2i(0),vec2i(i32(params.width)-1,i32(params.height)-1)),0);
}
@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if(id.x>=params.width || id.y>=params.height){return;}
    let p=vec2i(id.xy);
    let center=sampleAt(p);
    if(center.w==0u){textureStore(rawDepth,p,center);return;}
    let z=bitcast<f32>(center.x);
    let sigma=max(abs(z)*0.01,1e-4);
    var sum=0.0;var weight=0.0;
    for(var y=-2;y<=2;y++){for(var x=-2;x<=2;x++){
        let s=sampleAt(p+vec2i(x,y));
        if(s.w==0u){continue;}
        let depth=bitcast<f32>(s.x);
        let delta=(depth-z)/sigma;
        let w=exp(-0.5*(delta*delta+f32(x*x+y*y)/2.0));
        sum+=depth*w;weight+=w;
    }}
    textureStore(rawDepth,p,vec4u(bitcast<u32>(sum/max(weight,1e-6)),center.yzw));
}
`
        : ''
}
`;

export { DEPTH_TILE_SIZE, depthComputeShader };
