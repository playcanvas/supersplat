import path from 'path';
import copyAndWatch from './copy-and-watch.mjs';
import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import terser from '@rollup/plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import typescript from '@rollup/plugin-typescript';
// import { visualizer } from 'rollup-plugin-visualizer';

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

// debug, profile, release
const HREF       = process.env.BASE_HREF || '';
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = process.env.ENGINE_PATH || './node_modules/playcanvas';
const EXTRAS_DIR = path.resolve(ENGINE_DIR, 'build', 'playcanvas-extras.mjs');

const ENGINE_NAME = BUILD_TYPE === 'debug' ? 'playcanvas.dbg.mjs' : 'playcanvas.mjs';
const ENGINE_PATH = path.resolve(ENGINE_DIR, 'build', ENGINE_NAME);

const aliasEntries = {
    playcanvas: ENGINE_PATH,
    'playcanvas-extras': EXTRAS_DIR
};

const tsCompilerOptions = {
    baseUrl: '.',
    paths: {
        playcanvas: [ENGINE_DIR],
        'playcanvas-extras': [EXTRAS_DIR]
    }
};

const pipeline = input => {
    return {
        input: input,
        output: {
            dir: 'dist',
            format: 'esm',
            sourcemap: true
        },
        plugins: [
            input === 'src/bootstrap.ts' &&
                copyAndWatch({
                    targets: [
                        {
                            src: 'src/index.html',
                            transform: (contents, filename) => {
                                return contents.toString().replace('__BASE_HREF__', HREF);
                            }
                        },
                        {src: 'static/lib/draco_decoder.wasm', dest: 'static/lib'},
                        {src: 'static/env/VertebraeHDRI_v1_512.png', dest: 'static/env'}
                    ]
                }),
            image({dom: true}),
            alias({entries: aliasEntries}),
            resolve(),
            typescript({
                compilerOptions: tsCompilerOptions
            }),
            BUILD_TYPE === 'release' &&
                strip({
                    include: ['**/*.ts'],
                    functions: ['Debug.exec']
                }),
            BUILD_TYPE !== 'debug' && terser()
            // visualizer()
        ],
        treeshake: 'smallest',
        cache: false
    };
};

export default [
    {
        input: 'static/lib/draco_decoder.js',
        output: {
            file: 'dist/static/lib/draco_decoder.js'
        },
        plugins: [
            terser({
                mangle: {
                    reserved: ['DracoDecoderModule']
                }
            })
        ]
    },
    pipeline('src/bootstrap.ts'),
    pipeline('src/main.ts')
];
