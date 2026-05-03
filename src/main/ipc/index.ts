import { registerFileIpc } from './fileIpc'
import { registerImageIpc } from './imageIpc'
import { registerIrcIpc } from './ircIpc'
import { registerTerminalIpc } from './terminalIpc'
import { registerDbIpc } from './dbIpc'

export function registerAllIpc(): void {
  registerDbIpc()
  registerFileIpc()
  registerImageIpc()
  registerIrcIpc()
  registerTerminalIpc()
}
