"""
Tests for the Blockly -> Python code generator in code.html.

Drives the real generatePythonCode() in the page via Playwright.
Note: /code/ loads Blockly from the unpkg CDN, so these tests need
internet access.
"""

import pytest
from playwright.sync_api import Page

# live_server fixture comes from tests/test_status_page.py via conftest-less
# sharing: import it so pytest sees the same session server
from tests.test_status_page import live_server  # noqa: F401


def _generate(page: Page, live_server, build_js: str) -> str:
    page.goto(f'{live_server}/code/')
    page.wait_for_function("typeof Blockly !== 'undefined' && typeof workspace !== 'undefined'")
    return page.evaluate(f'''() => {{
        workspace.clear();
        {build_js}
        return generatePythonCode();
    }}''')


def test_loop_body_blocks_emitted_once_each(page: Page, live_server):
    """Regression: blocks after the first in a repeat body were duplicated,
    making the last block in a loop run double its set time."""
    code = _generate(page, live_server, '''
        const hat = workspace.newBlock('rover_on_receive');
        const rep = workspace.newBlock('rover_repeat');
        rep.setFieldValue(3, 'TIMES');
        const fwd = workspace.newBlock('rover_forward');
        const back = workspace.newBlock('rover_backward');
        hat.getInput('DO').connection.connect(rep.previousConnection);
        rep.getInput('DO').connection.connect(fwd.previousConnection);
        fwd.nextConnection.connect(back.previousConnection);
    ''')

    assert code.count('rover.forward(60)') == 1
    assert code.count('rover.reverse(60)') == 1
    assert 'for _ in range(3):' in code


def test_block_after_loop_not_indented_into_it(page: Page, live_server):
    """A block chained after the repeat block runs once, outside the loop."""
    code = _generate(page, live_server, '''
        const hat = workspace.newBlock('rover_on_receive');
        const rep = workspace.newBlock('rover_repeat');
        rep.setFieldValue(2, 'TIMES');
        const fwd = workspace.newBlock('rover_forward');
        const stop = workspace.newBlock('rover_stop');
        hat.getInput('DO').connection.connect(rep.previousConnection);
        rep.getInput('DO').connection.connect(fwd.previousConnection);
        rep.nextConnection.connect(stop.previousConnection);
    ''')

    lines = code.splitlines()
    assert '    rover.forward(60)' in lines      # inside the loop
    assert 'rover.stop()' in lines               # after it, unindented
    assert code.count('rover.forward(60)') == 1


def test_empty_loop_generates_valid_python(page: Page, live_server):
    """An empty repeat block must not generate a syntax error."""
    code = _generate(page, live_server, '''
        const hat = workspace.newBlock('rover_on_receive');
        const rep = workspace.newBlock('rover_repeat');
        rep.setFieldValue(2, 'TIMES');
        hat.getInput('DO').connection.connect(rep.previousConnection);
    ''')

    compile(code, '<generated>', 'exec')  # raises SyntaxError if broken
    assert 'pass' in code


def test_nested_loops_emit_once(page: Page, live_server):
    """Nested repeat: inner body emitted once, correctly double-indented."""
    code = _generate(page, live_server, '''
        const hat = workspace.newBlock('rover_on_receive');
        const outer = workspace.newBlock('rover_repeat');
        outer.setFieldValue(2, 'TIMES');
        const inner = workspace.newBlock('rover_repeat');
        inner.setFieldValue(4, 'TIMES');
        const fwd = workspace.newBlock('rover_forward');
        hat.getInput('DO').connection.connect(outer.previousConnection);
        outer.getInput('DO').connection.connect(inner.previousConnection);
        inner.getInput('DO').connection.connect(fwd.previousConnection);
    ''')

    compile(code, '<generated>', 'exec')
    assert code.count('rover.forward(60)') == 1
    assert '        rover.forward(60)' in code  # two levels of indent
