import {Scene} from "three";
import * as THREE from 'three'
import {Water} from "three/examples/jsm/objects/Water2";


export class HeightmapTerrain {
    protected scene: Scene;
    constructor(scene ) {
        this.scene = scene;
    }

    render() {
        const textureLoader = new THREE.TextureLoader();
        const waterGeometry = new THREE.PlaneGeometry( 4000, 4000 );
        const flowMap = textureLoader.load( 'textures/water/flowmap_water.png' );

        const water = new Water( waterGeometry, {
            scale: 2,
            textureWidth: 1024,
            textureHeight: 1024,
            flowMap: flowMap
        } );

        water.position.y = -10;
        water.rotation.x = Math.PI * - 0.5;
        //this.scene.add( water );

        let s = 1;


        const colorMap = textureLoader.load( 'textures/water/heightmap_color.png');
        colorMap.wrapS = THREE.RepeatWrapping;
        colorMap.wrapT = THREE.RepeatWrapping;
        colorMap.repeat.set(s, s);
        colorMap.colorSpace = THREE.SRGBColorSpace;



        const disMap = textureLoader.load( 'textures/water/heightmap_v3.png' );
        disMap.wrapS = THREE.RepeatWrapping;
        disMap.wrapT = THREE.RepeatWrapping;
        disMap.repeat.set(s, s);
// ground
        const groundGeometry = new THREE.PlaneGeometry( 4000, 4000, 250, 250 );

        const colorScale = 300.0;
        const uniforms = {
            bumpTexture: {value: disMap},
            bumpScale: {value: colorScale}
        }

        /**
         * The shader solution is really nice, but we cant use rays on it.
         */
        /*const shaderMaterial = new THREE.ShaderMaterial({
            uniforms:uniforms,
            vertexShader: document.getElementById('vertexShader').textContent,
            fragmentShader: document.getElementById('fragmentShader').textContent
        });*/

        const groundMaterial = new THREE.MeshStandardMaterial( {
            //wireframe: true,
            //aoMap:colorMap,
            displacementMap: disMap,
            displacementScale: 300,
            //roughness: 1,
            //metalness: 0,
            side: THREE.DoubleSide,
            map: colorMap,
        } );



        const ground = new THREE.Mesh( groundGeometry, groundMaterial );
        ground.rotation.x = Math.PI * - 0.5;
        //groundMaterial.needsUpdate = true;
        //ground.position.y = -130
        //ground.geometry.computeVertexNormals()
        //ground.geometry.computeBoundingBox();
        //ground.geometry.computeBoundingSphere();
        ground.geometry.boundingBox = null;
        ground.geometry.boundingSphere = null;
        ground.name = "MainTerrain";
        ground.updateMatrix();

        this.scene.add( ground );

        // water



        // flow map helper

        /*const helperGeometry = new THREE.PlaneGeometry( 4000, 4000 );
        const helperMaterial = new THREE.MeshBasicMaterial( { map: flowMap } );
        const helper = new THREE.Mesh( helperGeometry, helperMaterial );
        helper.position.y = 1.01;
        helper.rotation.x = Math.PI * - 0.5;
        helper.visible = false;
        this.scene.add( helper );*/
    }
}
