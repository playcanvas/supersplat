declare module '*.png' {
    const value: any;
    export default value;
}

declare module '*.svg' {
    const value: any;
    export default value;
}

declare module '*.scss' {
    const value: any;
    export default value;
}

// these declarations are so typescript considers the
// viewer source stored in src/templates as strings.
// we use rollup-plugin-string to inline these files.
declare module '*.css' {
    const content: string;
    export default content;
}

declare module '*.html' {
    const content: string;
    export default content;
}

declare module '*.js' {
    const content: string;
    export default content;
}
