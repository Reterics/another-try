import * as THREE from "three";
import {Mesh, Scene} from "three";


export class Sphere {
    protected mesh: Mesh;
    protected scene: Scene;

    /**
     * @param {Scene} scene
     * @param {number} radius - Array of numbers: width, height, depth
     * @param {number} widthSegments
     * @param {number} heightSegments
     * @param {string} colour - CSS color
     */
    constructor(scene: Scene, radius: number,
                widthSegments: number = 32, heightSegments: number = 16, colour = "grey") {
        const geometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments );
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
