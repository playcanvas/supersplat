import { Serializer } from './serializer';
import { Element, ElementType, ElementTypeList } from './element';

const common = new Set<Element>();

// this class tracks the state of scene elements and determines what
// type of objects have changed in a frame. this allows the rest of
// the application to respond to changes like re-rendering
// the scene or recalculating the scene bounding box.
class SceneState {
    states: any = {};
    activeValues: any[];

    serializer = new Serializer((value: any) => {
        this.activeValues.push(value);
    });

    constructor() {
        for (let i = 0; i < ElementTypeList.length; ++i) {
            this.states[ElementTypeList[i]] = {
                elements: new Map<Element, number>(),
                valueStart: [],
                valueCount: [],
                values: []
            };
        }
    }

    reset() {
        ElementTypeList.forEach(type => {
            const state = this.states[type];
            state.elements.clear();
            state.valueStart.length = 0;
            state.valueCount.length = 0;
            state.values.length = 0;
        });
    }

    pack(element: Element) {
        const state = this.states[element.type];
        const start = state.values.length;

        // let element store its values
        this.activeValues = state.values;
        element.serialize(this.serializer);

        state.elements.set(element, state.elements.size);
        state.valueStart.push(start);
        state.valueCount.push(state.values.length - start);
    }

    compare(other: SceneState) {
        function intersection<K, V>(result: Set<K>, a: Map<K, V>, b: Map<K, V>) {
            result.clear();
            for (const e of a.keys()) {
                if (b.has(e)) {
                    result.add(e);
                }
            }
        }

        function diff<K, V>(a: Map<K, V>, b: Set<K>) {
            for (const e of a.keys()) {
                if (!b.has(e)) {
                    return true;
                }
            }
        }

        function some<T>(it: IterableIterator<T>, predicate: (t: T) => boolean) {
            for (const e of it) {
                if (predicate(e)) {
                    return true;
                }
            }
            return false;
        }

        const result = {
            added: new Array<ElementType>(),
            removed: new Array<ElementType>(),
            moved: new Array<ElementType>(),
            changed: new Array<ElementType>()
        };

        ElementTypeList.forEach(type => {
            const prevState = other.states[type];
            const currState = this.states[type];

            // generate map of element to index
            const prev = prevState.elements;
            const curr = currState.elements;

            // make a set containing the elements present in both the previous and current frame
            intersection(common, prev, curr);

            // determine if any elements were added
            if (diff(curr, common)) {
                result.added.push(type);
            }

            // determine if any elements were removed
            if (diff(prev, common)) {
                result.removed.push(type);
            }

            // determine if any element moved order
            if (
                some(common.values(), (e: Element) => {
                    return prev.get(e) !== curr.get(e);
                })
            ) {
                result.moved.push(type);
            }

            // determine if any element's state changed
            if (
                some(common.values(), (e: Element) => {
                    const prevIdx = prev.get(e);
                    const currIdx = curr.get(e);
                    const count = prevState.valueCount[prevIdx];

                    if (count !== currState.valueCount[currIdx]) {
                        // number of state values changed
                        return true;
                    }

                    const prevStart = prevState.valueStart[prevIdx];
                    const currStart = currState.valueStart[currIdx];
                    const prevValues = prevState.values;
                    const currValues = currState.values;

                    for (let i = 0; i < count; ++i) {
                        if (prevValues[prevStart + i] !== currValues[currStart + i]) {
                            // state value changed
                            return true;
                        }
                    }

                    return false;
                })
            ) {
                result.changed.push(type);
            }
        });

        return result;
    }
}

export { SceneState };
