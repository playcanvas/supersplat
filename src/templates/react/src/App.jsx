import { Entity } from '@playcanvas/react'
import { Camera, Light, GSplat, Script } from '@playcanvas/react/components'
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs'
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs'
import XrControllers from 'playcanvas/scripts/esm/xr-controllers.mjs'
import { useSplat } from './hooks/use-asset'
import FrameScene from './scripts/frame-scene'
import Spinner from './components/Spinner'
const env = import.meta.env

function App() {

  const { data: splat, isPending } = useSplat('/splat.ply')

  if(isPending) {
    return <Spinner speed={200}/>
  }

  return (<>
    {/* <!-- Camera (with XR support) --> */}
    <Entity name="camera root">
      <Entity name="camera">
        <Camera clear-color={env.VITE_CLEAR_COLOR ?? 'black'} fov={env.VITE_FOV ?? 35}/>
        <Script script={CameraControls}/>
        <Script script={FrameScene} resetTarget={env.VITE_RESET_TARGET ?? null} resetPosition={env.VITE_RESET_POSITION ?? null}/>
      </Entity>
      <Script script={XrControllers}/>
      <Script script={XrNavigation}/>
    </Entity>
    {/* <!-- Light (for XR controllers) --> */}
    <Entity name="light" rotation={[35, 45, 0]}>
      <Light color="white" intensity={1.5}/>
    </Entity>
    {/* <!-- Splat --> */}
    <Entity name="splat" rotation={[0, 0, 180]}>
      <GSplat asset={splat}/>
    </Entity>
  </>)
}

export default App
