import fs from "node:fs";
const main = "FireboxAIStudio.jsx";
const lines = fs.readFileSync(main, "utf8").split("\n");
const headerIndex = lines.findIndex(line => line.includes('<div style={{ flexShrink:0, padding:"12px 12px 9px"'));
if (headerIndex < 0) throw new Error("Workspace project header not found");
lines[headerIndex] = '                    <div style={{ flexShrink:0, padding:"12px 12px 9px", borderBottom:`1px solid ${palette.border}` }}><div style={{ display:"flex", alignItems:"center", gap:7, color:palette.text, fontSize:12, fontWeight:700 }}><ChevronDown size={13} color={palette.textMuted}/><FireboxAgentMark size={15}/><span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentProjectName}</span></div></div>';
fs.writeFileSync(main, lines.join("\n"));

const component = "src/components/AgentActivityPanel.jsx";
let source = fs.readFileSync(component, "utf8");
const taskCard = '    <div className="active-task-card"><div className="active-task-left"><div className="agent-task-icon"><Bot size={18}/></div><div><div className="task-label">ACTIVE TASK</div><div className="task-name">{taskName}</div></div></div><button className="task-menu" type="button" aria-label="Task menu">•••</button></div>\n';
if (!source.includes(taskCard)) throw new Error("Active Task card not found");
source = source.replace(taskCard, "");
fs.writeFileSync(component, source);
console.log("Removed labels and Active Task card; preserved project title.");
