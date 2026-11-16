class EditorError extends Error {
    constructor(
        readonly code: string,
        message: string
    ) {
        super(message);
        this.name = 'EditorError';
    }
}

type CommandOptions = { signal?: AbortSignal };
type EditScope = 'selection' | 'layer';

const checkCancelled = (options?: CommandOptions) => {
    if (options?.signal?.aborted) {
        throw new EditorError('cancelled', 'The command was cancelled before it committed.');
    }
};

export { EditorError, checkCancelled };
export type { CommandOptions, EditScope };
