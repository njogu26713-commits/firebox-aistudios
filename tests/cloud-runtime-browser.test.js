import assert from "node:assert/strict";
import { createCloudRuntime } from "../server/agents/cloudRuntime.js";

const build = {
  _id: "browser-test",
  files: [
    { path: "package.json", content: JSON.stringify({ scripts: { start: "node server.js" } }) },
    { path: "server.js", content: `import http from "node:http"; http.createServer((req,res)=>{res.setHeader("content-type","text/html");res.end('<main><h1>Booking</h1><button id="book">Book appointment</button><p id="status"></p><script>document.querySelector("#book").onclick=()=>document.querySelector("#status").textContent="Booked"</script></main>')}).listen(Number(process.env.PORT||4174),"0.0.0.0")` },
  ],
};

const runtime = await createCloudRuntime({ build });
try {
  const started = await runtime.startPreview();
  assert.equal(started.running, true);
  await runtime.browser.browser_open("/");
  const page = await runtime.browser.browser_inspect();
  assert.match(page.text, /Booking/);
  const button = page.elements.find((item) => item.selector.includes("#book"));
  assert.ok(button);
  await runtime.browser.browser_click(button.selector);
  await runtime.browser.browser_assert("#status", "Booked");
  const consoleState = await runtime.browser.browser_console();
  assert.deepEqual(consoleState.consoleErrors, []);
  assert.deepEqual(consoleState.pageErrors, []);
  console.log("cloud runtime browser workflow ok");
} finally {
  await runtime.close();
}
