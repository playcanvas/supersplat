import { createFilter } from '@rollup/pluginutils';
export function importAsString(options) {
    const { include, exclude, transform = content => content } = options;
    const filter = createFilter(include, exclude);
    return {
        name: 'importAsString',
        transform(code, id) {
            if (filter(id)) {
                const content = transform(code, id) //
                    .replaceAll('\\', '\\\\')
                    .replaceAll('`', '\\`');
                return {
                    code: `export default \`${content}\`;`,
                    map: { mappings: '' },
                };
            }
        },
    };
}
export default importAsString;
