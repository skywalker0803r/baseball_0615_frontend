document.addEventListener('DOMContentLoaded', () => {
    // 取得 DOM 元素（影片上傳欄位、按鈕、訊息區塊等）
    const videoUpload = document.getElementById('videoUpload');
    const uploadButton = document.getElementById('uploadButton');
    const messageDiv = document.getElementById('message');
    const errorMessageDiv = document.getElementById('error-message');
    const analysisSection = document.getElementById('analysisSection');
    const analysisCanvas = document.getElementById('analysisCanvas');
    const ctx = analysisCanvas.getContext('2d');
    const currentFrameNumSpan = document.getElementById('currentFrameNum');

    // 運動力學指標 DOM 元素（以物件方式存取，避免逐一宣告）
    const metricIds = [
        'stride_angle', 'throwing_angle', 'arm_symmetry', 'hip_rotation',
        'elbow_height', 'ankle_height', 'shoulder_rotation', 
        'torso_tilt_angle', 'release_distance', 'shoulder_to_hip'
    ];
    const metricElements = Object.fromEntries(metricIds.map(id => [id, document.getElementById(id)]));

    const modelpredictContentDiv = document.getElementById('modelpredictContent');
    const historyList = document.getElementById('historyList');
    const stopAnalysisButton = document.getElementById('stopAnalysisButton');

    // 後端 API 網址（Render 部署後的後端網址）
    const API_BASE_URL = 'http://localhost:8000';
    let websocket = null; // WebSocket 實例，供後續使用

    // 加入歷史紀錄清單的函數，顯示最近分析過的影片紀錄
    function addHistoryEntry(filename, status, analysisTime) {
        const li = document.createElement('li');
        li.textContent = `${analysisTime} - 影片: ${filename} - 狀態: ${status}`;
        historyList.prepend(li); // 插入清單最上方
        if (historyList.children.length > 5) {
            historyList.removeChild(historyList.lastChild); // 最多顯示五筆
        }
    }

    // 處理上傳按鈕點擊事件
    uploadButton.addEventListener('click', async () => {
        const file = videoUpload.files[0]; // 取得使用者上傳的檔案
        if (!file) {
            errorMessageDiv.textContent = '請先選擇一個影片檔案。';
            errorMessageDiv.classList.remove('hidden');
            return;
        }

        // 重設畫面狀態與提示
        messageDiv.textContent = '影片上傳中...';
        errorMessageDiv.classList.add('hidden');
        uploadButton.disabled = true;
        modelpredictContentDiv.innerHTML = '<p>等待影片分析完成以獲取建議...</p>';

        const formData = new FormData();
        formData.append('file', file);

        try {
            // 步驟1：透過 POST 請求將影片上傳至後端
            const uploadResponse = await fetch(`${API_BASE_URL}/upload_video/`, {
                method: 'POST',
                body: formData
            });

            // 檢查回傳是否成功
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.detail || '影片上傳失敗');
            }

            const uploadResult = await uploadResponse.json(); // 包含檔名等資訊
            messageDiv.textContent = `影片上傳成功: ${uploadResult.filename}，開始分析...`;
            modelpredictContentDiv.innerHTML = `<p>${uploadResult.predict}</p>`;
            
            analysisSection.classList.remove('hidden');

            // 步驟2：建立 WebSocket 連線，接收分析資料
            const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws/analyze_video/${uploadResult.filename}`;
            websocket = new WebSocket(wsUrl);

            // WebSocket 成功連線後的處理
            websocket.onopen = () => {
                messageDiv.textContent = 'WebSocket 連線成功，正在接收分析數據...';
                stopAnalysisButton.disabled = false;
            };

            // WebSocket 接收分析資料（每幀）
            websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.error) {
                    // 若分析出錯，顯示錯誤訊息並中斷
                    errorMessageDiv.textContent = `分析錯誤: ${data.error}`;
                    errorMessageDiv.classList.remove('hidden');
                    messageDiv.textContent = '';
                    websocket.close();
                    return;
                }

                // 顯示骨架影像（Base64 JPEG 圖片）
                const img = new Image();
                img.src = 'data:image/jpeg;base64,' + data.frame_data;
                img.onload = () => {
                    // 根據畫布尺寸等比例縮放
                    const aspectRatio = img.width / img.height;
                    let drawWidth = analysisCanvas.width;
                    let drawHeight = analysisCanvas.height;
                    if (aspectRatio > analysisCanvas.width / analysisCanvas.height) {
                        drawHeight = drawWidth / aspectRatio;
                    } else {
                        drawWidth = drawHeight * aspectRatio;
                    }

                    // 清除畫布並畫出當前圖片
                    ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
                    ctx.drawImage(
                        img,
                        (analysisCanvas.width - drawWidth) / 2,
                        (analysisCanvas.height - drawHeight) / 2,
                        drawWidth,
                        drawHeight
                    );
                };

                // 更新目前幀號
                currentFrameNumSpan.textContent = data.frame_num;

                // 更新所有運動學指標資料（若值不存在則顯示 "---"）
                for (const id of metricIds) {
                    metricElements[id].textContent =
                        data.metrics[id] !== undefined ? data.metrics[id] : '---';
                }
            };

            // 分析結束或連線關閉
            websocket.onclose = () => {
                messageDiv.textContent = '分析已結束或連線斷開。';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                addHistoryEntry(uploadResult.filename, '完成', new Date().toLocaleTimeString());
            };

            // 處理 WebSocket 錯誤
            websocket.onerror = (error) => {
                errorMessageDiv.textContent = `WebSocket 錯誤: ${error.message || '未知錯誤'}`;
                errorMessageDiv.classList.remove('hidden');
                messageDiv.textContent = '';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                addHistoryEntry(uploadResult.filename, '失敗', new Date().toLocaleTimeString());
            };

        } catch (error) {
            // 處理上傳或連線錯誤
            errorMessageDiv.textContent = `上傳或分析失敗: ${error.message}`;
            errorMessageDiv.classList.remove('hidden');
            messageDiv.textContent = '';
            uploadButton.disabled = false;
            if (websocket) websocket.close();
            addHistoryEntry(file.name, '上傳失敗', new Date().toLocaleTimeString());
        }
    });

    // 處理停止分析按鈕
    stopAnalysisButton.addEventListener('click', () => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close(); // 中斷 WebSocket 連線
            messageDiv.textContent = '分析已手動停止。';
        }
        stopAnalysisButton.disabled = true;
        uploadButton.disabled = false;
    });
});
