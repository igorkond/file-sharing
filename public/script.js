'use strict';

var xhr;

document.addEventListener('DOMContentLoaded',async function(){
	document.getElementById('uploadFileButton').addEventListener('click', function(){
		const fileInput = document.getElementById('fileInput');
		const providedFile = fileInput.files[0];
		const status = document.getElementById('status');
		const progressBar = document.getElementById('progressBar');
		const loadedAndTotal = document.getElementById('loadedAndTotal');
		const abortUploadButton = document.getElementById('abortUploadButton');

		if(!(providedFile instanceof File)){
			alert('Пожалуйста, выберите файл');
			return;
		}

		const formData = new FormData();
		formData.append('file', providedFile);

		xhr = new XMLHttpRequest();

		xhr.upload.addEventListener('progress', event => {
			if (event.lengthComputable) {
				const percent = (event.loaded / event.total) * 100;

				progressBar.value = Math.round(percent);
				status.textContent = `Загрузка... ${Math.round(percent)}%`;
				loadedAndTotal.textContent = `${(event.loaded/1024).toFixed(2)} КБ из ${(event.total/1024).toFixed(2)} КБ`;
			}
		});

		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				status.textContent = 'Загрузка завершена';
				status.className = 'success';
				progressBar.value = 100;
			} else {
				status.textContent = 'Загрузка не удалась';
				status.className = 'error';
			}
			abortUploadButton.disabled = true;
		});

		xhr.addEventListener('error', () => {
			status.textContent = 'Загрузка не удалась (сетевая ошибка)';
			status.className = 'error';
			abortUploadButton.disabled = true;
		});

		xhr.addEventListener('abort', () => {
			status.textContent = 'Загрузка отменена';
			status.className = 'error';
			abortUploadButton.disabled = true;
		});
		
		xhr.addEventListener('readystatechange', () => {
			if (xhr.readyState === 4 && xhr.status === 201){
				const link = xhr.getResponseHeader('location');
				document.getElementById('displayedLinkToFile').innerHTML = `Файл ${providedFile.name} успешно загружен. Вот на него ссылка (действует 30 дней): 
				<br>
				<pre><a href="${link}">${link}</a></pre>`;
			}
		});
		
		xhr.open('POST', 'http://127.0.0.1:8080/files', true/*, userName, password*/);
		
		status.textContent = 'Загрузка начинается...';
		status.className = '';
		abortUploadButton.disabled = false;
		
		xhr.send(formData);		
	});
	document.getElementById('abortUploadButton').addEventListener('click', function(){
		if (xhr) {
			xhr.abort();
		}
	});
});