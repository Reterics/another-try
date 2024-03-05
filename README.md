<p align="center">
  <img src="./client/public/assets/images/png/logo-no-background.png" alt="Another Try Logo" height="85"/>
</p>

Another Try is a multiplayer RPG game, based on the powerful THREE.js library.

Dive deep into a world where the objective is simple: Keep it alive at all costs.

## Roadmap
 - **Pre-Alpha**:
   - Initial planed rendered (procedural terrain generation)
   - Building environment with base blocks
   - Multiplayer experience
   - Chat system
 - **Alpha**:
   - NPC Characters: People, animals
   - Extended building System
   - Improved shaders on grasses and terrain
 - **Early Access**:
   - Account registration
   - Character customization
   - Day and night cycle
   - Weather system
   - Improved Chat system
 - **Open Beta**:
   - Hunting
   - Items
   - Quests
   - Vendors

![Another Try In Game](./client/public/ingame4.png)

## Requirements

### For Play
 - A modern web browser supporting WebGL 2.0.
 - (Optional) A stable internet connection for multiplayer action.

### Build and Contribute
Node JS, and NPM is required for this repository. The recommended NPM version is 9 (*currently installed: 9.8.0*), whereas the recommended Node version is 18 and up. (*currently installed 20.5.0*)

If you don't have node already, install node from here: <https://nodejs.org/en/download/> or use nvm (explained later) to control which version is currently installed.

To check your npm and node version after node was installed:
```shell
node --version
npm --version
```

### Start Client
1. Clone the project or download in a .zip
2. In the /client/ folder execute `npm install`
3. To run the live Dev Build: `npm run dev`
   1. To create build: `npm run build`

### Start Server
1. Clone the project or download in a .zip
2. In the /server/ folder execute `npm install`
3. To run the live Dev Build: `npm run start`
 1. To create build: `npm run build`


### Notes
This repository is under development and serves only learning purposes. I do not take responsibility for any errors, or issues connected to this repository, and it's content.


## Credits

 - [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh): character movement
