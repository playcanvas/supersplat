import { Container, ContainerArgs } from '@playcanvas/pcui';

interface TableViewColumn {
    header: string;
    width?: number;
}

interface TableViewArgs extends ContainerArgs {
    columns: TableViewColumn[];
}

class TableView extends Container {
    protected _tableDom: HTMLTableElement;
    protected _theadDom: HTMLTableSectionElement;
    protected _tbodyDom: HTMLTableSectionElement;
    protected _columns: TableViewColumn[];
    selection = -1;

    constructor(args: any) {
        super(args);

        this._tableDom = document.createElement('table');
        this._theadDom = document.createElement('thead');
        this._tbodyDom = document.createElement('tbody');

        this._tableDom.className = 'table-view';
        this._tableDom.appendChild(this._theadDom);
        this._tableDom.appendChild(this._tbodyDom);

        // construct header
        const header = document.createElement('tr');
        args.columns.forEach((column: TableViewColumn) => {
            const label = document.createElement('label');
            label.textContent = column.header;

            const cell = document.createElement('th');
            cell.setAttribute('scope', 'col');
            cell.appendChild(label);

            header.appendChild(cell);
        });
        this._theadDom.appendChild(header);

        this.dom.appendChild(this._tableDom);

        this._columns = args.columns;
    }

    set rows(rows: string[][]) {
        // clear existing rows
        const newTbodyDom = document.createElement('tbody');
        this._tableDom.replaceChild(newTbodyDom, this._tbodyDom);
        this._tbodyDom = newTbodyDom;

        const rowDoms: HTMLTableRowElement[] = [];

        // construct new rows
        for (let i = 0; i < rows.length; ++i) {
            const row = rows[i];
            const rowDom = document.createElement('tr');

            rowDom.addEventListener('click', (event) => {
                for (let s = 0; s < rowDoms.length; ++s) {
                    if (s === i) {
                        rowDoms[s].classList.add('selected');
                    } else {
                        rowDoms[s].classList.remove('selected');
                    }
                }
                this.selection = i;
                this.emit('select', i);
            });
            rowDoms.push(rowDom);

            // construct row cells
            for (let j = 0; j < row.length; ++j) {
                const cell = row[j];

                const label = document.createElement('label');
                label.textContent = cell;

                const cellDom = document.createElement('td');
                if (this._columns[j].width) {
                    cellDom.style.width = `${this._columns[j].width}px`;
                }
                cellDom.appendChild(label);

                rowDom.appendChild(cellDom);
            }

            this._tbodyDom.append(rowDom);
        }
    }
}

export {
    TableViewColumn,
    TableViewArgs,
    TableView
};
