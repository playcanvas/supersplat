import { Vec3 } from 'playcanvas';

import { ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

type EffectType = 'none' | 'dissolve';

class ParticleEffects {
    private events: Events;
    private scene: Scene;
    private activeEffect: EffectType = 'none';
    private progress = 0;
    private targetProgress = 0;
    private sceneSize = 1;
    private center = new Vec3();
    private animating = false;
    private resetting = false;
    private directControl = false; // true when gesture is driving progress directly

    constructor(events: Events, scene: Scene) {
        this.events = events;
        this.scene = scene;

        // button-triggered effects
        events.on('particle.trigger', (effect: EffectType) => {
            console.log('[ParticleEffects] trigger:', effect);
            this.directControl = false;
            this.trigger(effect);
        });

        events.on('particle.reset', () => {
            console.log('[ParticleEffects] reset');
            this.directControl = false;
            this.reset();
        });

        // gesture sets the active effect type (without starting animation)
        events.on('particle.setEffect', (effect: EffectType) => {
            this.activeEffect = effect;
            this.ensureSceneInfo();
        });

        // gesture directly controls progress (continuous)
        events.on('particle.setProgress', (value: number) => {
            this.directControl = true;
            this.progress = value;
            this.animating = true;

            if (this.activeEffect === 'none') {
                this.activeEffect = 'dissolve';
            }
            this.ensureSceneInfo();
            this.applyUniforms();
        });

        scene.app.on('update', (dt: number) => {
            if (!this.directControl) {
                this.update(dt);
            }
        });
    }

    private ensureSceneInfo() {
        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];
        if (splats.length > 0) {
            const bound = splats[0].worldBound;
            const he = bound.halfExtents;
            this.sceneSize = Math.max(he.x, he.y, he.z) * 2;
            this.center.copy(bound.center);
        }
    }

    private trigger(effect: EffectType) {
        if (effect === 'none') {
            this.reset();
            return;
        }

        this.activeEffect = effect;
        this.progress = 0;
        this.targetProgress = 1;
        this.resetting = false;
        this.ensureSceneInfo();
        this.animating = true;
        this.events.fire('particle.effectChanged', effect);
    }

    private reset() {
        this.targetProgress = 0;
        this.resetting = true;
        this.animating = true;
        this.events.fire('particle.effectChanged', 'none');
    }

    private update(dt: number) {
        if (!this.animating) return;

        const speed = this.resetting ? 3.0 : 1.2;
        const diff = this.targetProgress - this.progress;

        if (Math.abs(diff) < 0.001) {
            this.progress = this.targetProgress;
            if (this.targetProgress === 0) {
                this.animating = false;
                this.activeEffect = 'none';
                this.resetting = false;
            }
        } else {
            this.progress += diff * Math.min(1, dt * speed);
        }

        this.applyUniforms();
    }

    private applyUniforms() {
        const effectId = this.getEffectId();
        const splats = this.scene.getElementsByType(ElementType.splat) as Splat[];

        for (const splat of splats) {
            if (!splat.entity?.gsplat?.instance) continue;
            const material = splat.entity.gsplat.instance.material;
            material.setParameter('u_particleEffect', effectId);
            material.setParameter('u_particleProgress', this.progress);
            material.setParameter('u_particleCenter', [this.center.x, this.center.y, this.center.z]);
            material.setParameter('u_particleSceneSize', this.sceneSize);
        }

        this.scene.forceRender = true;
    }

    private getEffectId(): number {
        switch (this.activeEffect) {
            case 'dissolve': return 2.0;
            default: return 0.0;
        }
    }
}

export { ParticleEffects };
