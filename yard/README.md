# Yard

Queue-based control system for the 4tronix M.A.R.S. Rover.

## Using the Visual Simulator

To see your rover programs in action, you'll want to run the visual simulator. This shows a simple representation of the rover so you can watch it move around.

1. First, make sure you've done the [first time setup](../README.md#first-time-on-any-particular-computer-setup) from the main project.

2. Open a terminal, navigate to the project root, and activate the environment:

```bash
cd 4tronix-rover-simulator
source env/bin/activate
```

3. Start the simulator UI:

```bash
python roversimui.py
```

You should see a window appear with a simple representation of the rover and its wheels.

4. Now you can run programs that control the rover. In a separate terminal (with the environment activated), try running one of the examples:

```bash
python square.py
```

Watch the simulator window - you should see the rover start moving!

## Documentation

| Doc | Description |
|-----|-------------|
| [Rover Server](docs/rover-server.md) | REST API server for queue-based control |
| [Architecture](docs/architecture.md) | How the system components fit together |
| [API Reference](docs/api.md) | Complete REST endpoint documentation |
| [Testing](docs/testing.md) | Running and writing tests |
| [Satellite](docs/satellite.md) | Web interface and camera server |
