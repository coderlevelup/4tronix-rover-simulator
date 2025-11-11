#!/usr/bin/python
#
# rover_web_driver.py
#
# Core implementation for controlling a rover via HTTP (either simulator or real hardware)
# This module provides the same API as the real rover.py but sends commands via HTTP.
#

#======================================================================
# General Functions
# (Both versions)
#
# init(brightness). Initialises GPIO pins, switches motors and LEDs Off. If brightness is 0, no LEDs are initialised
# cleanup(). Sets all motors and LEDs off and sets GPIO to standard values
# version(). Returns 4 for M.A.R.S. Rover. Invalid until after init() has been called
#======================================================================

#======================================================================
# Motor Functions
#
# stop(): Stops both motors
# forward(speed): Sets both motors to move forward at speed. 0 <= speed <= 100
# reverse(speed): Sets both motors to reverse at speed. 0 <= speed <= 100
# spinLeft(speed): Sets motors to turn opposite directions at speed. 0 <= speed <= 100
# spinRight(speed): Sets motors to turn opposite directions at speed. 0 <= speed <= 100
# turnForward(leftSpeed, rightSpeed): Moves forwards in an arc by setting different speeds. 0 <= leftSpeed,rightSpeed <= 100
# turnreverse(leftSpeed, rightSpeed): Moves backwards in an arc by setting different speeds. 0 <= leftSpeed,rightSpeed <= 100
#======================================================================


#======================================================================
# FIRELED Functions
#
# setColor(color): Sets all LEDs to color - requires show()
# setPixel(ID, color): Sets pixel ID to color - requires show()
# show(): Updates the LEDs with state of LED array
# clear(): Clears all LEDs to off - requires show()
# rainbow(): Sets the LEDs to rainbow colors - requires show()
# fromRGB(red, green, blue): Creates a color value from R, G and B values
# toRGB(color): Converts a color value to separate R, G and B
# wheel(pos): Generates rainbow colors across 0-255 positions
#======================================================================


#======================================================================
# UltraSonic Functions
#
# getDistance(). Returns the distance in cm to the nearest reflecting object. 0 == no object
#======================================================================


#======================================================================
# Servo Functions
#
# getLight(Sensor). Returns the value 0..1023 for the selected sensor, 0 <= Sensor <= 3
# getLightFL(). Returns the value 0..1023 for Front-Left light sensor
# getLightFR(). Returns the value 0..1023 for Front-Right light sensor
# getLightBL(). Returns the value 0..1023 for Back-Left light sensor
# getLightBR(). Returns the value 0..1023 for Back-Right light sensor
# getBattery(). Returns the voltage of the battery pack (>7.2V is good, less is bad)
#======================================================================


#======================================================================
# Keypad Functions
#
# getSwitch(). Returns the value of the tact switch: True==pressed
#======================================================================

import sys
from time import sleep, time
import requests


class RoverWebDriver:
    """
    Web-based rover driver that sends commands via HTTP.
    Can be used with either the simulator UI or real rover server.
    """

    def __init__(self, base_url="http://127.0.0.1:8523/"):
        """
        Initialize the rover web driver.

        Args:
            base_url: Base URL of the rover server (simulator or real hardware)
        """
        self.base_url = base_url
        # A session means that after the first connection, we should remain
        # connected to the server so it shouldn't be so slow
        self.request_session = requests.Session()

        # Define RGB LEDs
        self.leds = None
        self._brightness = 40
        self.numPixels = 4

        self.lDir = 0
        self.rDir = 0

    def _send_command(self, message):
        """Helper method to send commands with error handling."""
        try:
            self.request_session.post(self.base_url, json=message, timeout=2)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Silently ignore connection errors
            pass

    #======================================================================
    # General Functions
    #
    # init(). Initialises GPIO pins, switches motors and LEDs Off, etc
    def init(self, brightness, PiBit=False):
        if self.leds is None and brightness > 0:
            self._brightness = brightness
        print("Initialized")

    # cleanup(). Sets all motors and LEDs off and sets GPIO to standard values
    def cleanup(self):
        try:
            self.stop()
            if self.leds is not None:
                self.clear()
                self.show()
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            # Silently ignore connection errors during cleanup
            pass

    # End of General Functions
    #======================================================================

    #======================================================================
    # Motor Functions
    #
    # stop(): Stops both motors - coasts slowly to a stop
    def stop(self):
        self.lDir = 0
        self.rDir = 0
        message = {'wheelMotors': {'l': [0, 0], 'r': [0, 0]}}
        self._send_command(message)

    # brake(): Stops both motors - regenerative braking to stop quickly
    def brake(self):
        self.lDir = 0
        self.rDir = 0
        message = {'wheelMotors': {'l': [0, 0], 'r': [0, 0]}}
        self._send_command(message)

    # forward(speed): Sets both motors to move forward at speed. 0 <= speed <= 100
    def forward(self, speed):
        if self.lDir == -1 or self.rDir == -1:
            self.brake()
            sleep(0.2)
        # Reset servos to 0 degrees
        self.setServo(9, 0)   # servo_FL
        self.setServo(15, 0)  # servo_FR
        self.setServo(11, 0)  # servo_RL
        self.setServo(13, 0)  # servo_RR
        self.lDir = 1
        self.rDir = 1
        message = {'wheelMotors': {'l': [speed, 0], 'r': [speed, 0]}}
        self._send_command(message)

    # reverse(speed): Sets both motors to reverse at speed. 0 <= speed <= 100
    def reverse(self, speed):
        if self.lDir == 1 or self.rDir == 1:
            self.brake()
            sleep(0.2)
        # Reset servos to 0 degrees
        self.setServo(9, 0)   # servo_FL
        self.setServo(15, 0)  # servo_FR
        self.setServo(11, 0)  # servo_RL
        self.setServo(13, 0)  # servo_RR
        self.lDir = -1
        self.rDir = -1
        message = {'wheelMotors': {'l': [0, speed], 'r': [0, speed]}}
        self._send_command(message)

    # spinLeft(speed): Sets motors to turn opposite directions at speed. 0 <= speed <= 100
    def spinLeft(self, speed):
        if self.lDir == 1 or self.rDir == -1:
            self.brake()
            sleep(0.2)
        # Set servos for pivot mode
        self.setServo(9, 50)   # servo_FL
        self.setServo(15, -50) # servo_FR
        self.setServo(11, -50) # servo_RL
        self.setServo(13, 50)  # servo_RR
        self.lDir = -1
        self.rDir = 1
        message = {'wheelMotors': {'l': [0, speed], 'r': [speed, 0]}}
        self._send_command(message)

    # spinRight(speed): Sets motors to turn opposite directions at speed. 0 <= speed <= 100
    def spinRight(self, speed):
        if self.lDir == -1 or self.rDir == 1:
            self.brake()
            sleep(0.2)
        # Set servos for pivot mode
        self.setServo(9, 50)   # servo_FL
        self.setServo(15, -50) # servo_FR
        self.setServo(11, -50) # servo_RL
        self.setServo(13, 50)  # servo_RR
        self.lDir = 1
        self.rDir = -1
        message = {'wheelMotors': {'l': [speed, 0], 'r': [0, speed]}}
        self._send_command(message)

    # turnForward(leftSpeed, rightSpeed): Moves forwards in an arc by setting different speeds. 0 <= leftSpeed,rightSpeed <= 100
    def turnForward(self, leftSpeed, rightSpeed):
        if self.lDir == -1 or self.rDir == -1:
            self.brake()
            sleep(0.2)
        self.lDir = 1
        self.rDir = 1
        message = {'wheelMotors': {'l': [leftSpeed, 0], 'r': [rightSpeed, 0]}}
        self._send_command(message)

    # turnReverse(leftSpeed, rightSpeed): Moves backwards in an arc by setting different speeds. 0 <= leftSpeed,rightSpeed <= 100
    def turnReverse(self, leftSpeed, rightSpeed):
        if self.lDir == 1 or self.rDir == 1:
            self.brake()
            sleep(0.2)
        self.lDir = -1
        self.rDir = -1
        message = {'wheelMotors': {'l': [0, leftSpeed], 'r': [0, rightSpeed]}}
        self._send_command(message)

    # End of Motor Functions
    #======================================================================

    #======================================================================
    # Wheel Sensor Functions

    def stopL(self):
        pass

    def stopR(self):
        pass

    def lCounter(self, pin):
        pass

    def rCounter(self, pin):
        pass

    # stepForward(speed, steps): Moves forward specified number of counts, then stops
    def stepForward(self, speed, counts):
        pass

    # stepReverse(speed, steps): Moves backward specified number of counts, then stops
    def stepReverse(self, speed, counts):
        pass

    # stepSpinL(speed, steps): Spins left specified number of counts, then stops
    def stepSpinL(self, speed, counts):
        pass

    # stepSpinR(speed, steps): Spins right specified number of counts, then stops
    def stepSpinR(self, speed, counts):
        pass

    # End of Wheel Sensor Functions
    #======================================================================

    #======================================================================
    # IR Sensor Functions
    #
    # irLeft(): Returns state of Left IR Obstacle sensor
    def irLeft(self):
        return True

    # irRight(): Returns state of Right IR Obstacle sensor
    def irRight(self):
        return True

    # irAll(): Returns true if either of the Obstacle sensors are triggered
    def irAll(self):
        return True

    # irLeftLine(): Returns state of Left IR Line sensor
    def irLeftLine(self):
        return True

    # irRightLine(): Returns state of Right IR Line sensor
    def irRightLine(self):
        return True

    # End of IR Sensor Functions
    #======================================================================

    #======================================================================
    # UltraSonic Functions
    #
    # getDistance(). Returns the distance in cm to the nearest reflecting object. 0 == no object
    #
    def getDistance(self):
        # This would need to be returned from the server response
        return 0

    # End of UltraSonic Functions
    #======================================================================

    #======================================================================
    # RGB LED Functions
    #
    def setColor(self, color):
        for i in range(self.numPixels):
            self.setPixel(i, color)

    def setPixel(self, ID, color):
        if ID <= self.numPixels:
            pass  # Would need to track LED state and send in show()

    def show(self):
        pass  # Would send LED state to server

    def clear(self):
        for i in range(self.numPixels):
            self.setPixel(i, 0)

    def rainbow(self):
        for x in range(self.numPixels):
            self.setPixel(x, int(self.wheel(x * 256 / self.numPixels)))

    def fromRGB(self, red, green, blue):
        return ((int(red) << 16) + (int(green) << 8) + blue)

    def toRGB(self, color):
        return (((color & 0xff0000) >> 16), ((color & 0x00ff00) >> 8), (color & 0x0000ff))

    def wheel(self, pos):
        """Generate rainbow colors across 0-255 positions."""
        if pos < 85:
            return self.fromRGB(255 - pos * 3, pos * 3, 0)  # Red -> Green
        elif pos < 170:
            pos -= 85
            return self.fromRGB(0, 255 - pos * 3, pos * 3)  # Green -> Blue
        else:
            pos -= 170
            return self.fromRGB(pos * 3, 0, 255 - pos * 3)  # Blue -> Red

    # End of RGB LED Functions
    #======================================================================

    #======================================================================
    # Servo Functions

    def setServo(self, Servo, Degrees):
        message = {'servos': {Servo: Degrees}}
        self._send_command(message)

    def stopServos(self):
        for i in range(16):
            pass  # Would need server support

    # End of Servo Functions
    #======================================================================

    #======================================================================
    # EEROM Functions
    # First 16 bytes are used for servo offsets (signed bytes)

    # Low level read function. Reads data from actual Address
    def rdEEROM(self, Address):
        return 0

    # Low level write function. Writes Data to actual Address
    def wrEEROM(self, Address, Data):
        pass

    # General Read Function. Ignores first 16 bytes
    def readEEROM(self, Address):
        return self.rdEEROM(Address + 16)

    # General Write Function. Ignores first 16 bytes
    def writeEEROM(self, Address, Data):
        self.wrEEROM(Address + 16, Data)

    # Load all servo Offsets
    def loadOffsets(self):
        pass

    # Save all servo Offsets
    def saveOffsets(self):
        pass

    # End of EEROM Functions
    #======================================================================
