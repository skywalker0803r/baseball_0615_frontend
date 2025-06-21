// script.js (部分修改)
document.addEventListener('DOMContentLoaded', () => {
    // 取得 DOM 元素
    const videoUpload = document.getElementById('videoUpload');
    const uploadButton = document.getElementById('uploadButton');
    const messageDiv = document.getElementById('message');
    const errorMessageDiv = document.getElementById('error-message');
    const analysisSection = document.getElementById('analysisSection');
    const analysisCanvas = document.getElementById('analysisCanvas');
    const ctx = analysisCanvas.getContext('2d');
    const currentFrameNumSpan = document.getElementById('currentFrameNum');

    // Chart.js 相關元素
    const metricsChartCanvas = document.getElementById('metricsChart');
    let metricsChart;

    const modelpredictContentDiv = document.getElementById('modelpredictContent');
    const predictionResultDisplay = document.getElementById('predictionResultDisplay');
    const historyList = document.getElementById('historyList');
    const stopAnalysisButton = document.getElementById('stopAnalysisButton');

    const viewAllHistoryButton = document.getElementById('viewAllHistoryButton'); // 新增獲取按鈕

    const API_BASE_URL = 'https://baseball-0615-backend.onrender.com';
    let websocket = null;
    let currentRecordId = null; // 新增變數來儲存當前的 record_id

    const metricLabels = {
        'stride_angle': '步幅角度 (度)',
        'throwing_angle': '投擲角度 (度)',
        'arm_symmetry': '手臂對稱性 (%)',
        'hip_rotation': '髖部旋轉 (度)',
        'elbow_height': '手肘高度 (px)',
        'ankle_height': '腳踝高度 (px)',
        'shoulder_rotation': '肩部旋轉 (度)',
        'torso_tilt_angle': '軀幹傾斜角度 (度)',
        'release_distance': '釋放距離 (px)',
        'shoulder_to_hip': '肩髖距離 (px)'
    };

    // 載入歷史記錄的函數
    async function loadHistory() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/history`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const historyRecords = await response.json();
            historyList.innerHTML = ''; // 清空現有列表

            if (historyRecords.length === 0) {
                historyList.innerHTML = '<li>暫無分析記錄</li>';
            } else {
                historyRecords.forEach(record => {
                    const li = document.createElement('li');
                    li.textContent = `${record.upload_time} - ${record.filename} (${record.analysis_status}) - 預測: ${record.final_prediction}`;
                    historyList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            historyList.innerHTML = '<li>載入歷史記錄失敗</li>';
        }
    }

    // 在頁面載入時立即載入歷史記錄
    loadHistory();


    // 移除舊的 addHistoryEntry 函數，因為現在由後端管理

    uploadButton.addEventListener('click', async () => {
        const file = videoUpload.files[0];
        if (!file) {
            errorMessageDiv.textContent = '請選擇一個影片檔案。';
            errorMessageDiv.classList.remove('hidden');
            return;
        }

        messageDiv.textContent = '影片上傳中...';
        errorMessageDiv.classList.add('hidden');
        uploadButton.disabled = true;
        stopAnalysisButton.disabled = true; // 上傳中也禁用停止按鈕

        const formData = new FormData();
        formData.append('file', file);

        try {
            // STEP 1: 上傳影片並獲取 record_id
            const uploadResponse = await fetch(`${API_BASE_URL}/upload_video/`, {
                method: 'POST',
                body: formData,
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.detail || '影片上傳失敗');
            }

            const uploadResult = await uploadResponse.json();
            messageDiv.textContent = `影片上傳成功，開始分析... (檔案: ${uploadResult.filename})`;
            currentRecordId = uploadResult.record_id; // 儲存 record_id

            // STEP 2: 建立 WebSocket 連線，傳遞 record_id
            // 注意 WebSocket URL 的改變
            websocket = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws/analyze_video/${uploadResult.filename}/${currentRecordId}`);

            analysisSection.classList.remove('hidden');
            stopAnalysisButton.disabled = false;
            predictionResultDisplay.textContent = '等待影片分析完成以獲取模型預測結果...';
            predictionResultDisplay.className = ''; // 清除舊的樣式

            websocket.onopen = () => {
                console.log('WebSocket connection opened.');
            };

            websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.error) {
                    errorMessageDiv.textContent = `分析錯誤: ${data.error}`;
                    errorMessageDiv.classList.remove('hidden');
                    messageDiv.textContent = '';
                    websocket.close(); // 收到錯誤立即關閉 WebSocket
                    return;
                }

                if (data.video_meta) {
                    // 根據後端傳來的影片元數據設定 Canvas 尺寸
                    analysisCanvas.width = data.video_meta.width;
                    analysisCanvas.height = data.video_meta.height;
                    console.log(`Canvas resized to: ${analysisCanvas.width}x${analysisCanvas.height}`);
                } else if (data.image_data) {
                    // 處理圖像數據
                    const img = new Image();
                    img.onload = () => {
                        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
                        ctx.drawImage(img, 0, 0, analysisCanvas.width, analysisCanvas.height);
                    };
                    img.src = 'data:image/jpeg;base64,' + data.image_data;
                    currentFrameNumSpan.textContent = data.frame_num;

                    // 更新指標圖表
                    if (data.metrics && Object.keys(data.metrics).length > 0) {
                        updateMetricsChart(data.metrics);
                    }
                } else if (data.final_predict) {
                    // 顯示最終預測結果
                    predictionResultDisplay.textContent = `最終預測結果: ${data.final_predict}`;
                    if (data.final_predict === '好球') {
                        predictionResultDisplay.classList.add('good-pitch');
                    } else if (data.final_predict === '壞球') {
                        predictionResultDisplay.classList.add('bad-pitch');
                    } else {
                        predictionResultDisplay.classList.add('unknown-pitch');
                    }
                }
            };

            websocket.onclose = (event) => {
                console.log('WebSocket connection closed:', event);
                messageDiv.textContent = '分析已結束或連線斷開。';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                // 連線關閉後重新載入歷史記錄
                loadHistory();
            };

            websocket.onerror = (error) => {
                errorMessageDiv.textContent = `WebSocket 錯誤: ${error.message || '未知錯誤'}`;
                errorMessageDiv.classList.remove('hidden');
                messageDiv.textContent = '';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                // 發生錯誤時也重新載入歷史記錄
                loadHistory();
            };

        } catch (error) {
            errorMessageDiv.textContent = `上傳或分析失敗: ${error.message}`;
            errorMessageDiv.classList.remove('hidden');
            messageDiv.textContent = '';
            uploadButton.disabled = false;
            if (websocket) websocket.close();
            // 上傳失敗時重新載入歷史記錄
            loadHistory();
        }
    });

    stopAnalysisButton.addEventListener('click', () => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close();
            messageDiv.textContent = '分析已手動停止。';
        }
        stopAnalysisButton.disabled = true;
        uploadButton.disabled = false;
        // 清空 Canvas 內容
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
        // 手動停止後也重新載入歷史記錄
        loadHistory();
    });

    // 新增導航到歷史儀表板的按鈕事件
    viewAllHistoryButton.addEventListener('click', () => {
        window.location.href = 'history_dashboard.html'; // 導航到新的頁面
    });

    // Chart.js 的初始化和更新邏輯 (保持不變)
    function initMetricsChart() {
        const ctx = metricsChartCanvas.getContext('2d');
        metricsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [], // 幀數
                datasets: Object.keys(metricLabels).map(key => ({
                    label: metricLabels[key],
                    data: [],
                    borderColor: getRandomColor(),
                    fill: false,
                    hidden: false // 預設顯示所有指標
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // 允許 Canvas 不保持固定比例，以便填充空間
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: '幀數'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: '值'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: 20
                        }
                    }
                }
            }
        });
    }

    function updateMetricsChart(metrics) {
        const frameNum = parseInt(currentFrameNumSpan.textContent);
        if (metricsChart) {
            // 增加新的幀數標籤
            if (!metricsChart.data.labels.includes(frameNum)) {
                metricsChart.data.labels.push(frameNum);
            }

            // 更新每個數據集的數據
            metricsChart.data.datasets.forEach(dataset => {
                const metricKey = Object.keys(metricLabels).find(key => metricLabels[key] === dataset.label);
                if (metricKey && metrics[metricKey] !== undefined) {
                    // 確保數據點與標籤數量匹配
                    while (dataset.data.length < metricsChart.data.labels.length -1) {
                        dataset.data.push(null); // 填補缺失的數據點
                    }
                    dataset.data.push(metrics[metricKey]);
                } else {
                    // 如果某些指標在某些幀沒有數據，則填充 null
                    while (dataset.data.length < metricsChart.data.labels.length) {
                        dataset.data.push(null);
                    }
                }
            });

            // 限制圖表顯示的數據點數量，避免過於密集
            const maxDataPoints = 150; // 例如，只顯示最近的 150 幀數據
            if (metricsChart.data.labels.length > maxDataPoints) {
                const startIndex = metricsChart.data.labels.length - maxDataPoints;
                metricsChart.data.labels = metricsChart.data.labels.slice(startIndex);
                metricsChart.data.datasets.forEach(dataset => {
                    dataset.data = dataset.data.slice(startIndex);
                });
            }

            metricsChart.update();
        }
    }

    // 生成隨機顏色，用於圖表的數據集
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // 初始化圖表
    initMetricsChart();
});