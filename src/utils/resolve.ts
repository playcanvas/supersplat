import type { ScopeSpace } from 'playcanvas';

const resolve = <T extends object>(scope: ScopeSpace, values: T) => {
    for (const [key, value] of Object.entries(values)) {
        scope.resolve(key).setValue(value);
    }
};

export { resolve };
