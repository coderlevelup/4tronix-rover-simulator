# Mars Rover Simple Drive Mode
# Similar to motortest.py but integrates servo steering
# Moves: Forward, Reverse, turn Right, turn Left, Stop 
# Press Ctrl-C to stop

from __future__ import print_function
import rover, time

#======================================================================
# Reading single character by forcing stdin to raw mode
import sys
import tty
import termios

# Servo numbers
servo_FL = 9
servo_RL = 11
servo_FR = 15
servo_RR = 13
servo_MA = 0

def readchar():
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)
    try:
        tty.setraw(sys.stdin.fileno())
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
    if ch == '0x03':
        raise KeyboardInterrupt
    return ch

def readkey(getchar_fn=None):
    getchar = getchar_fn or readchar
    c1 = getchar()
    if ord(c1) != 0x1b:
        return c1
    c2 = getchar()
    if ord(c2) != 0x5b:
        return c1
    c3 = getchar()
    return chr(0x10 + ord(c3) - 65)  # 16=Up, 17=Down, 18=Right, 19=Left arrows

# End of single character reading
#======================================================================

def goForward():
    rover.setServo(servo_FL, 0)
    rover.setServo(servo_FR, 0)
    rover.setServo(servo_RL, 0)
    rover.setServo(servo_RR, 0)
    rover.forward(speed)

def goReverse():
    rover.setServo(servo_FL, 0)
    rover.setServo(servo_FR, 0)
    rover.setServo(servo_RL, 0)
    rover.setServo(servo_RR, 0)
    rover.reverse(speed)

def goLeft():
    rover.setServo(servo_FL, -20)
    rover.setServo(servo_FR, -20)
    rover.setServo(servo_RL, 20)
    rover.setServo(servo_RR, 20)

def goRight():
    rover.setServo(servo_FL, 20)
    rover.setServo(servo_FR, 20)
    rover.setServo(servo_RL, -20)
    rover.setServo(servo_RR, -20)


def pivot():
    rover.setServo(servo_FL, 50)
    rover.setServo(servo_FR, -50)
    rover.setServo(servo_RL, -50)
    rover.setServo(servo_RR, 50)



speed = 60
mast_angle = 0

print ("Drive M.A.R.S. Rover around")
print ("Use arrow keys / wasd to steer")
print ("Use - to slow down, = to speed up")
print ("Use , to pan mast left, . to pan mast right")
print ("Use [ ] to spin left/right")
print ("Press space bar to coast to stop")
print ("Press b to brake and stop quickly")
print ("Press Ctrl-C to end")
print

rover.init(0)

# main loop
try:
    while True:
        keyp = readkey()
        if keyp == 'w' or ord(keyp) == 16:
            goForward()
            print ('Forward', speed)
        elif keyp == 's' or ord(keyp) == 17:
            goReverse()
            print ('Reverse', speed)
        elif keyp == 'd' or ord(keyp) == 18:
            goRight()
            print ('Go Right', speed)
        elif keyp == 'a' or ord(keyp) == 19:
            goLeft()
            print ('Go Left', speed)
        elif keyp == '=':
            speed = min(100, speed+10)
            print ('Speed+', speed)
        elif keyp == '-':
            speed = max(0, speed-10)
            print ('Speed-', speed)
        elif keyp == ',':
            target = min(90, mast_angle+10)
            for a in range(mast_angle+1, target+1):
                rover.setServo(servo_MA, a)
                time.sleep(0.02)
            mast_angle = target
            print ('Mast', mast_angle)
        elif keyp == '.':
            target = max(-90, mast_angle-10)
            for a in range(mast_angle-1, target-1, -1):
                rover.setServo(servo_MA, a)
                time.sleep(0.02)
            mast_angle = target
            print ('Mast', mast_angle)
        elif keyp == ' ':
            rover.stop()
            print ('Stop')
        elif keyp == 'b':
            rover.brake()
            rover.setServo(servo_FL, 0)
            rover.setServo(servo_FR, 0)
            rover.setServo(servo_RL, 0)
            rover.setServo(servo_RR, 0)
            print ('Brake')
        elif keyp == '[':
            rover.stop()
            pivot()
            rover.spinLeft(speed)
        elif keyp == ']':
            rover.stop()
            pivot()
            rover.spinRight(speed)
        elif ord(keyp) == 3:
            break
        else:
            rover.stop()




except KeyboardInterrupt:
    pass

finally:
    rover.cleanup()
    
