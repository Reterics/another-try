import {Sky} from "three/examples/jsm/objects/Sky";
import * as THREE from "three";
import { Mesh, Light, Scene } from "three";


export default class ATSky {
    scene: Scene;
    private _children: (Mesh|Light)[];
    constructor(scene: Scene) {
        this.scene = scene;

        this._children = [];
        const sky = new Sky();
        sky.name = "sky";
        sky.scale.setScalar( 450000 );
        this._children.push(sky);
        const effectController = {
            turbidity: 2.3,
            rayleigh: 2,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.57,
            elevation: 23,
            azimuth: 180,
        };

        const sun = new THREE.Vector3();
        const uniforms = sky.material.uniforms;
        uniforms[ 'turbidity' ].value = effectController.turbidity;
        uniforms[ 'rayleigh' ].value = effectController.rayleigh;
        uniforms[ 'mieCoefficient' ].value = effectController.mieCoefficient;
        uniforms[ 'mieDirectionalG' ].value = effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad( 90 - effectController.elevation );
        const theta = THREE.MathUtils.degToRad( effectController.azimuth );

        sun.setFromSphericalCoords( 1, phi, theta );

        uniforms[ 'sunPosition' ].value.copy( sun );

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        ambientLight.name = "sky";
        this._children.push(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.name = "sky";
        this._children.push(directionalLight);

        return this;
    }

    addToScene() {
        const sky = this.scene.children
            .filter(mesh => mesh.name === 'sky');
        if (sky.length) {
            sky.forEach(element => this.scene.remove(element));
        }
        this._children.forEach(c=>this.scene.add(c));
    }

}