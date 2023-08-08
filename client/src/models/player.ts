import { Scene } from "three";
import { Sphere } from "./sphere";


export class Player extends Sphere {

    constructor (scene: Scene) {
        super(scene, 3, 32, 32, "red");
        this.setPosition(0, 10, 0);
    }
}
