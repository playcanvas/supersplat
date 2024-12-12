import fs from 'fs';
import path from 'path';

// custom plugin to copy files and watch them
export default function copyAndWatch(config) {
    const resolvedConfig = {
        targets: []
    };

    // resolve source directories into files
    config.targets.forEach(target => {
        const readRec = pathname => {
            if (!fs.existsSync(pathname)) {
                console.log(`skipping missing file ${target.src}`);
            } else {
                if (fs.lstatSync(pathname).isDirectory()) {
                    const children = fs.readdirSync(pathname);
                    children.forEach(childPath => {
                        readRec(path.join(pathname, childPath));
                    });
                } else {
                    let dest;
                    if (fs.lstatSync(target.src).isDirectory()) {
                        dest = path.join(
                            target.dest || '',
                            path.basename(target.destFilename || target.src),
                            path.relative(target.src, pathname)
                        );
                    } else {
                        dest = path.join(target.dest || '', path.basename(target.destFilename || target.src));
                    }
                    resolvedConfig.targets.push({
                        src: pathname,
                        dest: dest,
                        transform: target.transform
                    });
                }
            }
        };
        readRec(target.src);
    });

    return {
        name: 'copy-and-watch',
        async buildStart() {
            // disable watching during production build
            if (process.env.NODE_ENV !== 'production') {
                resolvedConfig.targets.forEach(target => {
                    this.addWatchFile(target.src);
                });
            }
        },
        async generateBundle() {
            resolvedConfig.targets.forEach(target => {
                const contents = fs.readFileSync(target.src);
                this.emitFile({
                    type: 'asset',
                    fileName: target.dest,
                    source: target.transform ? target.transform(contents, target.src) : contents
                });
            });
        }
    };
}
