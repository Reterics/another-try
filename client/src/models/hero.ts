import {RoundedBoxGeometry} from "three/examples/jsm/geometries/RoundedBoxGeometry";
import * as THREE from "three";
import {Mesh, MeshBasicMaterial, Scene} from "three";


export class Hero {
    private readonly material: MeshBasicMaterial;
    private readonly geometry: RoundedBoxGeometry;
    private readonly mesh: Mesh<RoundedBoxGeometry, MeshBasicMaterial>;
    protected scene: Scene;

    constructor(scene: Scene) {
        this.scene = scene;
        this.geometry = new RoundedBoxGeometry( 20.0, 20.0, 1.0, 10, 10.5 );
        this.material = new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true});
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.capsuleInfo = {
            radius: 0.5,
            segment: new THREE.Line3( new THREE.Vector3(), new THREE.Vector3( 0, - 1.0, 0.0 ) )
        };
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.material.shadowSide = 2;
    }

    getMesh() {
        return this.mesh;
    }

    addToScene() {
        this.scene.add(this.mesh);
    }
}
