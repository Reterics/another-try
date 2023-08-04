import * as THREE from "three";
import {Mesh, Scene} from "three";


export class Box {
    protected mesh: Mesh;
    protected scene: Scene;

    /**
     * @param {Scene} scene
     * @param {number[]} size - Array of numbers: width, height, depth
     * @param {string} colour - CSS color
     */
    constructor(scene: Scene, size:number[] = [300, 0, 300],
                colour = "grey") {
        const geometry = new THREE.BoxGeometry(size[0], size[1], size[2] );
        const material = new THREE.MeshBasicMaterial( {color: colour} );
        this.mesh = new THREE.Mesh( geometry, material );
        this.scene = scene;
    }

    addToScene() {
        this.scene.add(this.mesh);
    }

    setPosition(x, y, z) {
        this.mesh.position.set(x, y, z)
    }

    getMesh() {
        return this.mesh;
    }

    public set name(name:string) {
        this.mesh.name = name;
    }

    public get name() {
        return this.mesh.name;
    }
}
