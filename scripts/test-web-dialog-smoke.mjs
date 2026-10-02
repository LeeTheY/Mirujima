/* global document */
import process from "node:process";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
const project = process.cwd(), root = await mkdtemp(join(tmpdir(), "mirujima-dialog-"));
let server, browser;
try {
  await writeFile(join(root, "index.html"), '<html lang="ko"><body><div id="root"></div><script type="module" src="/main.jsx"></script></body></html>');
  await writeFile(join(root, "main.jsx"), `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{Dialog}from'/@fs/${project}/apps/web/components/dialog.tsx';import{DialogAccessibility}from'/@fs/${project}/apps/web/components/dialog-accessibility.tsx';import'/@fs/${project}/apps/web/app/globals.css';function Fixture(){const[a,A]=useState(false),[b,B]=useState(false);return <><DialogAccessibility/><button onClick={()=>A(true)}>안내 열기</button><button>배경 행동</button>{a&&<Dialog title="집중 안내" onClose={()=>A(false)}><label>계획 이름<input /></label><button onClick={()=>B(true)}>중첩 안내 열기</button>{b&&<Dialog title="확인 안내" onClose={()=>B(false)}><button onClick={()=>B(false)}>확인</button></Dialog>}</Dialog>}</>};const container=document.getElementById('root');const root=window.fixtureRoot??=createRoot(container);root.render(<Fixture/>);`);
  server = await createServer({ configFile: false, root, plugins: [react()], resolve: { alias: { react: resolve("node_modules/react"), "react-dom": resolve("node_modules/react-dom") } }, server: { hmr: false, host: "127.0.0.1", port: 3209, strictPort: true, fs: { allow: [project, root] } } }); await server.listen();
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await page.goto("http://127.0.0.1:3209"); const open = page.getByRole("button", { name: "안내 열기", exact: true }); await open.click();
  const first = page.getByRole("dialog", { name: "집중 안내", exact: true }); await expect(first).toBeVisible();
  await expect(page.getByRole("button", { name: "집중 안내 닫기" })).toBeFocused();
  assert(await page.getByRole("button", { name: "배경 행동", includeHidden: true }).evaluate((element) => Boolean(element.closest("[inert]"))));
  for (let index=0;index<8;index++) { await page.keyboard.press("Tab"); assert(await first.evaluate((dialog) => dialog.contains(document.activeElement))); }
  await page.getByRole("button", { name: "중첩 안내 열기" }).click(); await expect(page.getByRole("dialog", { name: "확인 안내" })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog", { name: "확인 안내" })).toHaveCount(0); await expect(page.getByRole("button", { name: "중첩 안내 열기" })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); await expect(open).toBeFocused();
  assert.equal(await page.getByRole("button", { name: "배경 행동" }).evaluate((element) => Boolean(element.closest("[inert]"))), false);
  await page.evaluate(() => {
    const stream = document.createElement("div"); stream.id = "stream-fixture"; stream.hidden = true;
    stream.innerHTML = '<section class="modal-content" aria-label="지연 도착 안내"><button class="icon-close-button">지연 안내 닫기</button></section>';
    document.body.append(stream);
  });
  await expect(open).toBeFocused();
  await page.evaluate(() => { document.getElementById("stream-fixture").hidden = false; });
  await expect(page.getByRole("button", { name: "지연 안내 닫기" })).toBeFocused();
  await page.evaluate(() => document.getElementById("stream-fixture").remove());
  await expect(open).toBeFocused();
  process.stdout.write("PASS actual Dialog manager: focus, Tab trap, inert background, nested Escape, restored focus and hidden streamed content at 320px.\n");
} finally { await browser?.close(); await server?.close(); await rm(root,{recursive:true,force:true}); }
