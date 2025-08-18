from flask import Flask, render_template, jsonify, request
import roversimulator as rover

app = Flask(__name__)
rover.init(40)  # Initialize with LED brightness of 40

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/command/<cmd>', methods=['POST'])
def handle_command(cmd):
    speed = request.json.get('speed', 100) if request.json else 100
    
    commands = {
        'forward': lambda: rover.forward(speed),
        'backward': lambda: rover.reverse(speed),
        'spin_left': lambda: rover.spinLeft(speed),
        'spin_right': lambda: rover.spinRight(speed),
        'stop': lambda: rover.stop()
    }
    
    if cmd in commands:
        commands[cmd]()
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Invalid command'}), 400

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
