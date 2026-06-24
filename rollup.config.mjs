import { readFileSync } from 'fs';

import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import copy from 'rollup-plugin-copy';
import scss from 'rollup-plugin-scss';
import { string } from 'rollup-plugin-string';
import sass from 'sass';

function htmlPlugin() {
    return {
        name: 'html',
        buildStart() {
            this.addWatchFile('src/index.html');
        },
        generateBundle() {
            const contents = readFileSync('src/index.html', 'utf-8');
            const transformed = contents.replace('<base href="">', `<base href="${process.env.BASE_HREF ?? ''}">`);
            this.emitFile({
                type: 'asset',
                fileName: 'index.html',
                source: transformed
            });
        }
    };
}

const buildCss = {
    input: 'src/index.scss',
    output: {
        dir: 'public'
    },
    plugins: [
        scss({
            exclude: ['static/**/*'],
            fileName: 'index.css',
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            }
        }),
        {
            name: 'suppress-empty-chunks',
            generateBundle(options, bundle) {
                for (const [fileName, chunk] of Object.entries(bundle)) {
                    if (chunk.type === 'chunk' && chunk.code.trim() === '') {
                        delete bundle[fileName];
                    }
                }
            }
        }
    ]
};

const debugEngine = process.env.ENGINE === 'debug';

const buildPublic = {
    input: 'src/index.ts',
    output: {
        dir: 'public',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        resolve(debugEngine ? { exportConditions: ['development'] } : {}),
        typescript(),
        json(),
        htmlPlugin()
    ]
};

const buildDist = {
    input: 'src/module/index.ts',
    output: {
        file: 'dist/index.js',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        string({
            include: ['**/*.html', '**/*.css', '**/*.js']
        }),
        typescript({ noEmit: true }),
        json(),
        copy({
            targets: [
                { src: 'src/module/index.d.ts', dest: 'dist' },
                { src: 'src/module/settings.d.ts', dest: 'dist' }
            ]
        })
    ]
};

const buildSettings = {
    input: 'src/settings.ts',
    output: {
        file: 'dist/settings.js',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        typescript({ noEmit: true })
    ]
};

export default [
    buildCss,
    buildPublic,
    buildDist,
    buildSettings
];
