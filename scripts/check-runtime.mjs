import net from 'node:net';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  console.error(`当前 Node.js ${process.versions.node}；本项目需要 Node.js 24。请先运行 nvm use 24.9.0（或已安装的 24.x 版本），再运行 npm run dev。`);
  process.exit(1);
}
const ports = [Number(process.env.WEB_PORT || 4173), Number(process.env.API_PORT || 4174)];
if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535) || ports[0] === ports[1]) {
  console.error('WEB_PORT / API_PORT 必须是不同的有效端口。');
  process.exit(1);
}
for (const port of ports) {
  try {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => server.close(resolve));
    });
  } catch {
    console.error(`端口 ${port} 无法使用。请先 Ctrl+C 停止旧服务，或运行 WEB_PORT=5173 API_PORT=5174 npm run dev。`);
    process.exit(1);
  }
}
