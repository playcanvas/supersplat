import { Container, Element, Label } from '@playcanvas/pcui';

type Direction = 'left' | 'right' | 'top' | 'bottom';

// Tooltip text may be a static string or a resolver. A resolver is evaluated
// each time the tooltip is shown, so localized tooltips always reflect the
// current language without any language-change listener.
type TooltipText = string | (() => string);

type TooltipDetails = {
    description: string;
    image?: string;
};

class Tooltips extends Container {
    register: (target: Element, text: TooltipText, direction?: Direction, details?: TooltipDetails) => void;
    unregister: (target: Element) => void;
    destroy: () => void;

    constructor(args: any = {}) {
        args = {
            ...args,
            class: 'tooltips',
            hidden: true
        };

        super(args);

        const text = new Label({
            class: 'tooltips-content'
        });

        const description = new Label({
            class: 'tooltips-description'
        });

        const tooltipImage = document.createElement('img');
        tooltipImage.className = 'tooltips-image';

        this.append(text);
        this.append(description);
        this.dom.appendChild(tooltipImage);

        const targets = new Map<Element, any>();
        const style = this.dom.style;
        let timer: number = 0;
        let expansionTimer: number = 0;
        let activeTarget: Element | null = null;

        const cancelTimer = () => {
            if (timer >= 0) {
                clearTimeout(timer);
                timer = -1;
            }
        };

        const cancelExpansion = () => {
            if (expansionTimer >= 0) {
                clearTimeout(expansionTimer);
                expansionTimer = -1;
            }
            this.dom.classList.remove('expanded');
            description.dom.classList.remove('visible');
            tooltipImage.classList.remove('visible');
            tooltipImage.removeAttribute('src');
            description.text = '';
        };

        const startTimer = (fn: () => void) => {
            timer = window.setTimeout(() => {
                fn();
                timer = -1;
            }, 250);
        };

        this.register = (target: Element, textString: TooltipText, direction: Direction = 'bottom', details?: TooltipDetails) => {
            const currentTarget = target;

            const activate = () => {
                if (activeTarget !== currentTarget) return;

                const rect = target.dom.getBoundingClientRect();
                const midx = Math.floor((rect.left + rect.right) * 0.5);
                const midy = Math.floor((rect.top + rect.bottom) * 0.5);

                switch (direction) {
                    case 'left':
                        style.left = `${rect.left}px`;
                        style.top = `${midy}px`;
                        style.transform = 'translate(calc(-100% - 10px), -50%)';
                        break;
                    case 'right':
                        style.left = `${rect.right}px`;
                        style.top = `${midy}px`;
                        style.transform = 'translate(10px, -50%)';
                        break;
                    case 'top':
                        style.left = `${midx}px`;
                        style.top = `${rect.top}px`;
                        style.transform = 'translate(-50%, calc(-100% - 10px))';
                        break;
                    case 'bottom':
                        style.left = `${midx}px`;
                        style.top = `${rect.bottom}px`;
                        style.transform = 'translate(-50%, 10px)';
                        break;
                }

                text.text = typeof textString === 'function' ? textString() : textString;
                style.display = 'inline-block';

                // clamp to viewport so tooltip doesn't go off-screen
                const tooltipRect = this.dom.getBoundingClientRect();
                if (tooltipRect.left < 0) {
                    style.left = `${parseFloat(style.left) - tooltipRect.left}px`;
                } else if (tooltipRect.right > window.innerWidth) {
                    style.left = `${parseFloat(style.left) - (tooltipRect.right - window.innerWidth)}px`;
                }

                if (details) {
                    expansionTimer = window.setTimeout(() => {
                        if (activeTarget !== currentTarget) return;
                        description.text = details.description;
                        description.dom.classList.add('visible');
                        if (details.image) {
                            tooltipImage.src = details.image;
                            tooltipImage.classList.add('visible');
                        }
                        this.dom.classList.add('expanded');
                        expansionTimer = -1;
                    }, 750);
                }
            };

            const enter = () => {
                cancelTimer();
                cancelExpansion();
                activeTarget = currentTarget;

                if (style.display === 'inline-block') {
                    activate();
                } else {
                    startTimer(() => activate());
                }
            };

            const leave = () => {
                cancelTimer();

                const wasExpanded = this.dom.classList.contains('expanded');
                cancelExpansion();
                activeTarget = null;

                if (style.display === 'inline-block') {
                    if (wasExpanded) {
                        style.display = 'none';
                    } else {
                        startTimer(() => {
                            style.display = 'none';
                        });
                    }
                }
            };

            target.dom.addEventListener('pointerenter', enter);
            target.dom.addEventListener('pointerleave', leave);

            target.on('destroy', () => {
                this.unregister(target);
            });

            targets.set(target, { enter, leave });
        };

        this.unregister = (target: Element) => {
            const value = targets.get(target);
            if (value) {
                target.dom.removeEventListener('pointerenter', value.enter);
                target.dom.removeEventListener('pointerleave', value.leave);
                targets.delete(target);
            }
        };

        this.destroy = () => {
            cancelTimer();
            cancelExpansion();
            for (const target of targets.keys()) {
                this.unregister(target);
            }
        };
    }
}

export { Tooltips };
