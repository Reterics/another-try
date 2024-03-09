import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky";
import { Scene } from "three";

export function initSky (scene: Scene) {
    // Add Sky
    const sky = new Sky();
    sky.scale.setScalar( 450000 );
    scene.add( sky );
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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    scene.add(directionalLight);

}
