import { Vec3 } from "playcanvas";

class Category{
    name: string;
    id = 0;
    color: Array<number>;
    attributes: any[] = [];

    constructor(name: string, id: number, color: Array<number>, attributes: any[]) {
        this.name = name;
        this.id = id;
        this.color = color;
        this.attributes = attributes;
    }
}

class Annotation{
    id = 0;
    category_id = 0;
    attributes: any[] = [];
    isHidden = false;

    constructor(id: number, category_id: number, attributes: any[], isHidden: boolean) {
        this.id = id;
        this.category_id = category_id;
        this.attributes = attributes;
        this.isHidden = isHidden;
    }
}

class Label{
    name: string;
    annotations: Array<Annotation>;
    point_annotations: Uint32Array;

    constructor(name: string, annotations: Array<Annotation>, point_annotations: Uint32Array) {
        this.name = name;
        this.annotations = annotations;
        this.point_annotations = point_annotations;
    }
}

class GSplatLabels {
    static MAX_UNIFORM_COLORS = 256;

    categories: Array<Category>;
    labels: Array<Label>;

    constructor(data: any) {
        // Parsing categories
        this.categories = data.dataset.task_attributes.categories.map((cat: any) => {
            return new Category(cat.name, cat.id, cat.color, cat.attributes || []);
        });

        // Parsing labels from first sample - TODO enable multiple sample parsing
        this.labels = Object.entries(data.dataset.samples[0].labels).map(([labelName, labelObj]: [string, any]) => {
            const annotations = labelObj.attributes.annotations.map((ann: any) => {
                return new Annotation(ann.id, ann.category_id, ann.attributes || [], ann.isHidden);
            });
        
            const pointAnnotations = new Uint32Array(labelObj.attributes.point_annotations);
        
            return new Label(labelName, annotations, pointAnnotations);
        });
    }

    concatenated_colors(): Float32Array {
        // Flatten all color arrays from categories and normalize the color values (0-255 to 0-1)
        const colorArray = this.categories.flatMap(category => {
            return category.color.map((c: number) => c / 255); // Normalize by dividing by 255
        });

        const maxLength = GSplatLabels.MAX_UNIFORM_COLORS * 3;

        // If the colorArray is less than maxLength, pad it with zeros (black color)
        if (colorArray.length < maxLength) {
            const padding = new Array(maxLength - colorArray.length).fill(0);
            colorArray.push(...padding);
        }

        return new Float32Array(colorArray);
    }

    get numberOfCategories(): number {
        return this.categories.length;
    }
}

export { GSplatLabels };