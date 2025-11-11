#!/usr/bin/python
#
# roversimulator.py
#
# Enables development of code designed to run on the 4tronix M.A.R.S. Rover
# without needing to be connected to the actual Rover.
#
# This provides the same API as the real rover.py at
#   http://4tronix.co.uk/rover/rover.py
#
# This is a thin wrapper around rover_web_driver.py configured for the local simulator.
#

from rover_web_driver import RoverWebDriver

# Create a driver instance pointing to the local simulator
_driver = RoverWebDriver("http://127.0.0.1:8523/")

# Export all driver methods as module-level functions
init = _driver.init
cleanup = _driver.cleanup
stop = _driver.stop
brake = _driver.brake
forward = _driver.forward
reverse = _driver.reverse
spinLeft = _driver.spinLeft
spinRight = _driver.spinRight
turnForward = _driver.turnForward
turnReverse = _driver.turnReverse
stopL = _driver.stopL
stopR = _driver.stopR
lCounter = _driver.lCounter
rCounter = _driver.rCounter
stepForward = _driver.stepForward
stepReverse = _driver.stepReverse
stepSpinL = _driver.stepSpinL
stepSpinR = _driver.stepSpinR
irLeft = _driver.irLeft
irRight = _driver.irRight
irAll = _driver.irAll
irLeftLine = _driver.irLeftLine
irRightLine = _driver.irRightLine
getDistance = _driver.getDistance
setColor = _driver.setColor
setPixel = _driver.setPixel
show = _driver.show
clear = _driver.clear
rainbow = _driver.rainbow
fromRGB = _driver.fromRGB
toRGB = _driver.toRGB
wheel = _driver.wheel
setServo = _driver.setServo
stopServos = _driver.stopServos
rdEEROM = _driver.rdEEROM
wrEEROM = _driver.wrEEROM
readEEROM = _driver.readEEROM
writeEEROM = _driver.writeEEROM
loadOffsets = _driver.loadOffsets
saveOffsets = _driver.saveOffsets
