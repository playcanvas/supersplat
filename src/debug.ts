class Debug {
    static exec(func: () => void) {
        func();
    }

    static time(label: string) {
        console.time(label);
    }

    static timeEnd(label: string) {
        console.timeEnd(label);
    }
}

export {Debug};
