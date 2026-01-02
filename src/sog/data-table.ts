/**
 * Lightweight data table for organizing gaussian splat data.
 * Port of splat-transform's DataTable with minimal dependencies.
 */

type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

/**
 * A single column of data in a DataTable.
 */
class Column {
    name: string;
    data: TypedArray;

    constructor(name: string, data: TypedArray) {
        this.name = name;
        this.data = data;
    }

    clone(): Column {
        return new Column(this.name, this.data.slice());
    }
}

type Row = {
    [colName: string]: number;
};

/**
 * A table of columnar data, where each column has the same number of rows.
 */
class DataTable {
    columns: Column[];

    constructor(columns: Column[]) {
        if (columns.length === 0) {
            throw new Error('DataTable must have at least one column');
        }

        // check all columns have the same lengths
        for (let i = 1; i < columns.length; i++) {
            if (columns[i].data.length !== columns[0].data.length) {
                throw new Error(`Column '${columns[i].name}' has inconsistent number of rows: expected ${columns[0].data.length}, got ${columns[i].data.length}`);
            }
        }

        this.columns = columns;
    }

    // rows

    get numRows() {
        return this.columns[0].data.length;
    }

    getRow(index: number, row: Row = {}, columns = this.columns): Row {
        for (const column of columns) {
            row[column.name] = column.data[index];
        }
        return row;
    }

    setRow(index: number, row: Row, columns = this.columns) {
        for (const column of columns) {
            if (Object.prototype.hasOwnProperty.call(row, column.name)) {
                column.data[index] = row[column.name];
            }
        }
    }

    // columns

    get numColumns() {
        return this.columns.length;
    }

    get columnNames() {
        return this.columns.map(column => column.name);
    }

    getColumn(index: number): Column {
        return this.columns[index];
    }

    getColumnByName(name: string): Column | undefined {
        return this.columns.find(column => column.name === name);
    }

    hasColumn(name: string): boolean {
        return this.columns.some(column => column.name === name);
    }

    addColumn(column: Column) {
        if (column.data.length !== this.numRows) {
            throw new Error(`Column '${column.name}' has inconsistent number of rows: expected ${this.numRows}, got ${column.data.length}`);
        }
        this.columns.push(column);
    }

    // general

    clone(): DataTable {
        return new DataTable(this.columns.map(c => c.clone()));
    }
}

export { Column, DataTable, TypedArray, Row };

