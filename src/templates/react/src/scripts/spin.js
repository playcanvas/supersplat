import { Script } from 'playcanvas'

export default class Spin extends Script {
  update(dt) {
    this.entity.rotate(0, this.speed * dt, 0)
  }
}