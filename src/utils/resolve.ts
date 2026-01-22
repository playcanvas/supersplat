import { ScopeSpace } from 'playcanvas';

const resolve = (scope: ScopeSpace, values: any) => {
    for (const [key, value] of Object.entries(values)) {
        scope.resolve(key).setValue(value);
    }
};

export { resolve };
