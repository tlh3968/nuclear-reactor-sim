import argparse
import shutil
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description="Exercise the V2 desktop console against a running server.")
parser.add_argument("--url", default="http://127.0.0.1:8000/")
parser.add_argument("--chromium", default=shutil.which("chromium") or shutil.which("chromium-browser"))
parser.add_argument("--artifacts", type=Path, default=Path(tempfile.gettempdir()) / "reactor-lab-v2")
options = parser.parse_args()
options.artifacts.mkdir(parents=True, exist_ok=True)

def number(page, selector):
 return float(page.locator(selector).text_content().replace(',', '').replace('%',''))

def assert_fits(page):
 errors=page.evaluate('''() => {
 const issues=[];
 for(const selector of ['.systems-panel','.controls-panel','.system-content','.controls-content','.instrument-dock']) {
  const e=document.querySelector(selector); if(e.scrollHeight>e.clientHeight+2) issues.push(selector+' overflows '+e.scrollHeight+'/'+e.clientHeight);
 }
 for(const selector of ['#emergency-switch','#fuel-reserve','#scram-button','#volume','#thermal-power','#fuel-temp','#steam-pressure','#turbine-rpm','#steam-temp','#condenser-temp','#efficiency','#primary-knob','#steam-knob','#cooling-knob','.trend-panel','.alarms-panel']) {
  const r=document.querySelector(selector).getBoundingClientRect(); if(r.bottom>innerHeight || r.right>innerWidth || r.left<0 || r.top<0) issues.push(selector+' outside viewport');
 }
 if(document.documentElement.scrollHeight>innerHeight || document.documentElement.scrollWidth>innerWidth) issues.push('page overflow');
 return issues;
}''')
 assert not errors, errors

with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=options.chromium,headless=True)
 page=browser.new_page(viewport={'width':1366,'height':768})
 errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
 page.add_init_script('''const Native=window.AudioContext; if(Native){window.AudioContext=class extends Native{constructor(...args){super(...args);window.__audio=this;window.__gains=[];}createGain(){const g=super.createGain();window.__gains.push(g);return g;}}}''')
 page.goto(options.url,wait_until='networkidle')
 assert_fits(page)
 assert page.locator('#plant-status').text_content()=='NORMAL OPERATION'
 page.get_by_role('button',name='Pause simulation').click()
 t=page.locator('#sim-time').text_content();page.wait_for_timeout(400)
 assert page.locator('#sim-time').text_content()==t
 inc=page.locator('[data-adjust="reactor"][data-step="1"]')
 inc.click();assert number(page,'#reactor-command')==61
 inc.hover();page.mouse.down();page.wait_for_timeout(850);page.mouse.up()
 assert number(page,'#reactor-command')>=64
 page.locator('[data-inspect="primary"]').click()
 assert 'selected' in page.locator('#control-primary').get_attribute('class')
 page.locator('#primary-switch').click()
 assert page.locator('#primary-switch').get_attribute('aria-pressed')=='false'
 assert number(page,'#primary-command')==70
 assert number(page,'#primary-actual')==70
 print('PASS: all instruments fit 1366×768; pause, momentary/held controls, component selection, and maintained pump commands',flush=True)

 page.locator('#reset-button').click()
 page.get_by_role('button',name='Pause simulation').click()
 # The plan layer has no baked-in data: the image must load, and knobs operate the real state.
 assert page.request.get(options.url.rstrip('/')+'/assets/plant-plan-dark.png').status==200
 knob=page.get_by_role('slider',name='primary coolant pump setting')
 knob.focus();knob.press('ArrowUp')
 assert number(page,'#primary-command')==71
 assert number(page,'#primary-actual')==70
 knob.press('Home')
 for _ in range(7): knob.press('PageUp')
 assert number(page,'#primary-command')==70
 box=knob.bounding_box()
 page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2)
 page.mouse.down();page.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2-40,steps=8);page.mouse.up()
 assert number(page,'#primary-command')==90
 assert number(page,'#primary-actual')==70
 assert page.locator('#primary-needle path').evaluate('(p)=>{const r=p.getBoundingClientRect(),b=p.closest("svg").getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom;}')
 page.locator('[data-valve="0"]').click()
 assert number(page,'#steam-command')==0
 assert number(page,'#steam-actual')==65
 page.locator('[data-valve="100"]').click()
 assert number(page,'#steam-command')==100
 page.locator('#reset-button').click()
 page.get_by_role('button',name='Pause simulation').click()
 print('PASS: plan asset, knob keyboard/drag input, visible pointer, command/actual separation, and valve commands',flush=True)

 page.locator('#layout-button').click()
 page.locator('[data-drag="systems"]').drag_to(page.locator('[data-drag="alarms"]'))
 order=lambda:page.locator('#instrument-dock > [data-panel]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.panel)')
 assert order()==['alarms','trends','systems']
 handle=page.get_by_role('separator',name='Resize systems panel',include_hidden=True);handle.focus();handle.press('ArrowLeft')
 assert float(handle.get_attribute('aria-valuenow'))==52
 page.locator('#layout-button').click();assert_fits(page)
 page.reload(wait_until='networkidle')
 assert order()==['alarms','trends','systems']
 assert page.get_by_role('separator',name='Resize systems panel',include_hidden=True).get_attribute('aria-valuenow')=='52'
 assert_fits(page)
 page.locator('#layout-button').click();page.locator('#layout-reset').click();page.locator('#layout-button').click()
 assert order()==['systems','trends','alarms']
 print('PASS: native instrument docking, keyboard resize, saved layout after reload, and layout reset',flush=True)

 page.locator('#sound-button').click()
 assert page.locator('#sound-button').get_attribute('aria-pressed')=='true'
 assert page.evaluate('window.__audio.state')=='running'
 page.locator('#volume').evaluate('(e)=>{e.value=0;e.dispatchEvent(new Event("input",{bubbles:true}));}')
 page.wait_for_timeout(250)
 assert page.evaluate('window.__gains[0].gain.value')<.001
 page.locator('#volume').evaluate('(e)=>{e.value=35;e.dispatchEvent(new Event("input",{bubbles:true}));}')
 page.locator('#sound-button').click()
 assert page.locator('#sound-button').get_attribute('aria-pressed')=='false'
 page.get_by_role('button',name='Pause simulation').click()
 page.locator('#help-button').click();assert page.locator('#help-dialog').is_visible()
 page.get_by_role('button',name='Close model information').click()
 assert page.locator('#pause-button').get_attribute('aria-pressed')=='true'
 print('PASS: gesture-enabled audio, master mute/volume, and model-info pause preservation',flush=True)

 page.locator('#reset-button').click()
 page.locator('#speed').select_option('60')
 page.locator('#primary-switch').click();page.locator('#cooling-switch').click()
 page.wait_for_function('document.querySelector("#plant-status").textContent==="COOLING EMERGENCY"',timeout=8000)
 assert page.locator('#scram-button').is_disabled()
 assert page.locator('#emergency-switch').is_enabled()
 page.get_by_role('button',name='Pause simulation').click()
 count=page.locator('#alarm-count').text_content()
 page.locator('#ack-button').click()
 assert page.locator('#alarm-count').text_content()==count
 assert page.locator('#plant-status').text_content()=='COOLING EMERGENCY'
 assert page.locator('.alarm-entry.unack').count()==0
 page.locator('#silence-button').click()
 assert page.locator('#silence-button').get_attribute('aria-pressed')=='true'
 page.get_by_role('button',name='Resume simulation').click()
 page.wait_for_function('document.querySelector("#plant-status").textContent.includes("CORE DAMAGE")',timeout=45000)
 assert number(page,'#integrity-value')<100
 assert page.locator('#silence-button').get_attribute('aria-pressed')=='false','New alarm must re-annunciate'
 page.screenshot(path=str(options.artifacts / 'v2-core-damage.png'))
 page.locator('#emergency-switch').click()
 page.wait_for_function('document.querySelector("#plant-status").textContent==="DAMAGE STABILIZED"',timeout=12000)
 assert number(page,'#integrity-value')<100
 page.wait_for_function('Number(document.querySelector("#fuel-temp").textContent.replaceAll(",","")) < 1000',timeout=3000)
 page.screenshot(path=str(options.artifacts / 'v2-stabilized.png'))
 page.locator('#reset-button').click()
 assert number(page,'#integrity-value')==100
 assert page.locator('#alarm-count').text_content()=='0'
 assert page.locator('#plant-status').text_content()=='NORMAL OPERATION'
 print('PASS: cooling emergency after successful trip, independent ACK/silence, new-alarm escalation, core damage, auxiliary cooling recovery, persistent damage, and experiment reset',flush=True)

 page.get_by_role('button',name='Pause simulation').click()
 page.screenshot(path=str(options.artifacts / 'v2-final-1366.png'))
 for width, height in [(1280, 720), (1920, 904), (1920, 960), (1600, 900), (1920, 1080)]:
  page.set_viewport_size({'width':width,'height':height});assert_fits(page)
 page.screenshot(path=str(options.artifacts / 'v2-final-1920.png'))
 page.emulate_media(reduced_motion='reduce')
 assert page.locator('.primary-flow path').first.evaluate('(e)=>getComputedStyle(e).animationName')=='none'
 assert not errors,errors
 print('PASS: 1920×1080 layout, reduced motion, and no JavaScript runtime errors',flush=True)
 browser.close()
