import { Entity } from '@playcanvas/react'
import { Script, Render, Camera, Light } from '@playcanvas/react/components'
import Spin from '../scripts/spin'

/**
 * A simple spinning cube used as a loading indicator.
 * @param {number} speed - The speed of the spinning cube.
 * @returns 
 */
const Spinner = ({ speed = 10 }) => (<>
    <Entity name='light' >
      <Light type='directional' color="orange" />
    </Entity>
    <Entity name="camera" position={[0, 0, 50]}>
      <Camera clearColor={import.meta.env.VITE_CLEAR_COLOR ?? 'black'} />
    </Entity>
    <Entity name="loading">
      <Render type="box"/>
      <Script script={Spin} speed={speed}/>
    </Entity>
</>)

export default Spinner