'use strict';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable} from 'node:stream';
import createHash from 'node:crypto';
import http from 'node:http';
import fsp from 'node:fs/promises';
import sanitize from 'sanitize-filename';
import contentDisposition from 'content-disposition';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ipAddress = '127.0.0.1';
const port = 8080;
const baseUrl = `http://${ipAddress}:${port}`;

const numberOfMillisecondsInHour = 60*60*1000;
const numberOfMillisecondsIn30Days = 30*24*numberOfMillisecondsInHour;
const rootPath = dirname(__dirname);
const outerDirPath = join(rootPath, 'storage');
await fsp.mkdir(outerDirPath, {recursive: true});

(async function automaticallyTryToDeleteOldFiles(){
	const innerDirNames = await fsp.readdir(outerDirPath); //each innerDirName is the timestamp of last change of its first (and almost certainly the only) file
	for(const innerDirName of innerDirNames){
		const innerDirPath = join(outerDirPath, innerDirName);
		const fileNames = await fsp.readdir(innerDirPath);
		for(const fileName of fileNames){
			const filePath = join(innerDirPath, fileName);
			const timestampOfLastChange = (await fsp.stat(filePath)).ctimeMs;
			if(Date.now()-timestampOfLastChange > numberOfMillisecondsIn30Days){
				await fsp.unlink(filePath);
			}
		}
		const namesOfNondeletedFilesInInderDir = await fsp.readdir(innerDirPath);
		if(!namesOfNondeletedFilesInInderDir.length){
			await fsp.rmdir(innerDirPath);
		}
	}
	setTimeout(automaticallyTryToDeleteOldFiles, numberOfMillisecondsInHour);
})();

async function uploadFile(fileName: string, file: Buffer): Promise<string> {
	const innerDirName = fileName+'_'+Date.now(); //almost certainly unique (so that each innerDirName has only one file, and this file's name should be fileName's value)
	const innerDirPath = join(outerDirPath, innerDirName);
	await fsp.mkdir(innerDirPath); //even without the recursive option, this shouldn't throw, because innerDirName is almost certainly unique
	const filePath = join(innerDirPath, fileName);
	await fsp.writeFile(filePath, file);
	const timestampOfLastChange = (await fsp.stat(filePath)).ctimeMs;
	const renamedInnerDirPath = join(outerDirPath, String(timestampOfLastChange));
	await fsp.rename(innerDirPath, renamedInnerDirPath);
	return `${baseUrl}/files?name=${encodeURIComponent(fileName)}&timestamp=${timestampOfLastChange}`.replace(/&/g, '&amp;');
}

const server = http.createServer(async function(request: InstanceType<typeof http.IncomingMessage>, response: InstanceType<typeof http.ServerResponse>){
	response.setHeader('Cache-Control', 'no-store');
	if(!request.url || !request.method){
		response.writeHead(400, { 'Content-Type': 'text/plain' });
		response.end('Ни url, ни method запроса не должны быть пустыми');
		return;
	}
	const {href, pathname, searchParams} = new URL(request.url, baseUrl);
	const method = request.method.toLowerCase();
	if(pathname === '/files' && method === 'post') {
		const webHeaders: Record<string, string> = {};
		for(const key of Object.keys(request.headers)){
			const value = request.headers[key];
			if(Array.isArray(value)){
				webHeaders[key] = value.join(', ');
			}else if(value){
				webHeaders[key] = value;
			}
		}
		const webRequest = new Request(href, {
			method,
			headers: webHeaders,
			body: Readable.toWeb(request),
			duplex: 'half'
		});
		const formData = await webRequest.formData();
		const file = formData.get('file');
		if(!(file instanceof File)){
			throw new Error('file is expected to be an instance of File');
		}
		try{
			const location = await uploadFile(sanitize(file.name), Buffer.from(await file.arrayBuffer()));
			response.writeHead(201, {'Content-Type': 'text/plain', 'Location': location});
			response.end();
		}catch(e: unknown){
			response.writeHead(400, {'Content-Type': 'text/plain'});
			response.end('Не удалось загрузить файл. Эта ошибка никогда не должна возникнуть');
		}
		
	}else if(pathname === '/files' && method === 'get'){
		const fileName = sanitize(String(searchParams.get('name')));
		const timestampOfLastChange = sanitize(String(searchParams.get('timestamp')));
		const innerDirName = timestampOfLastChange;
		try{
			const file = await fsp.readFile(join(outerDirPath, innerDirName, fileName))!;
			response.writeHead(200, {'Content-Disposition': contentDisposition(fileName)});
			response.end(file);
		}catch(e: unknown){
			response.writeHead(400, {'Content-Type': 'text/plain'});
			response.end('Данная ссылка истекла и больше не работает');
		}
		
	}else if(pathname === '/' && method === 'get'){
		const body = await fsp.readFile(join(dirname(__dirname),'public','index.html'));
		response.writeHead(200, {'Content-Type': 'text/html'});
		response.end(body);
		
	}else if(pathname === '/script.js' && method === 'get'){
		const body = await fsp.readFile(join(dirname(__dirname),'public','script.js'));
		response.writeHead(200, {'Content-Type': 'text/javascript'});
		response.end(body);
		
	}else if(pathname === '/styles.css' && method === 'get'){
		const body = await fsp.readFile(join(dirname(__dirname),'public','styles.css'));
		response.writeHead(200, {'Content-Type': 'text/css'});
		response.end(body);
		
	}else if(pathname === '/favicon.ico' && method === 'get'){
		const body = await fsp.readFile(join(dirname(__dirname),'public','favicon.ico'));
		response.writeHead(200, {'Content-Type': 'image/x-icon'});
		response.end(body);
		
	}else{
		response.writeHead(404, {'Content-Type': 'application/json'});
		response.end(JSON.stringify({error: 'Not found'}));
	}
});

server.listen(port, ipAddress, () => {
	console.log('Server listening...');
});