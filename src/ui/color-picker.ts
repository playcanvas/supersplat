import { ColorPicker as PcuiColorPicker, type ColorPickerArgs } from '@playcanvas/pcui';

import { hsv2rgb } from './color';

const isAchromaticRgb = (color: number[]) => {
    return color.length >= 3 && color[0] === color[1] && color[1] === color[2];
};

class ColorPicker extends PcuiColorPicker {
    protected _setPickerColor(color: number[]) {
        if (this._changing || this._dragging) {
            super._setPickerColor(color);
            return;
        }

        const hue = this._colorHSV[0];
        super._setPickerColor(color);
        this._restoreHueForAchromaticColor(color, hue);
    }

    protected _callPicker(color: number[]) {
        const hue = this._colorHSV[0];
        super._callPicker(color);
        this._restoreHueForAchromaticColor(color, hue);
    }

    private _restoreHueForAchromaticColor(color: number[], hue: number) {
        if (!isAchromaticRgb(color)) {
            return;
        }

        this._colorHSV[0] = hue;

        const rgb = hsv2rgb({ h: hue, s: 1, v: 1 });
        const plainColor = [
            Math.round(rgb.r * 255),
            Math.round(rgb.g * 255),
            Math.round(rgb.b * 255)
        ].join(',');

        this._pickHueHandle.style.top = `${Math.floor(this._size * hue)}px`;
        this._pickRect.style.backgroundColor = `rgb(${plainColor})`;
        this._pickHueHandle.style.backgroundColor = `rgb(${plainColor})`;
    }
}

export { ColorPicker };
export type { ColorPickerArgs };
