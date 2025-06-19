document.addEventListener('DOMContentLoaded', () => {
    // 取得 DOM 元素
    const videoUpload = document.getElementById('videoUpload');
    const uploadButton = document.getElementById('uploadButton');
    const messageDiv = document.getElementById('message');
    const errorMessageDiv = document.getElementById('error-message');
    const analysisSection = document.getElementById('analysisSection');
    // const videoPlayer = document.getElementById('videoPlayer'); // 不再需要 videoPlayer
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

    const API_BASE_URL = 'https://baseball-0615-backend.onrender.com';
    let websocket = null;

    const metricLabels = {
        'stride_angle': '步幅角度 (度)',
        'throwing_angle': '投擲角度 (度)',
        'arm_symmetry': '手臂對稱性 (%)',
        'hip_rotation': '髖部旋轉 (度)',
        'elbow_height': '手肘高度 (px)',
        'ankle_height': '腳踝高度 (px)',
        'shoulder_rotation': '肩膀旋轉 (度)',
        'torso_tilt_angle': '軀幹傾斜角度 (度)',
        'release_distance': '釋放距離 (m)',
        'shoulder_to_hip': '肩髋间距 (m)'
    };
    const metricIds = Object.keys(metricLabels);

    //let originalVideoFps = 30; // 不再由前端控制播放速度
    //let receivedLandmarks = {}; // 不再緩存骨架數據，直接顯示圖像
    //let animationFrameId = null; // 不再需要 requestAnimationFrame 循環

    // 初始化長條圖
    function initializeChart() {
        if (metricsChart) {
            metricsChart.destroy();
        }
        metricsChart = new Chart(metricsChartCanvas, {
            type: 'bar',
            data: {
                labels: Object.values(metricLabels),
                datasets: [{
                    label: '關鍵指標數值',
                    data: new Array(metricIds.length).fill(0),
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 500,
                    easing: 'easeInOutQuad'
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: '數值'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '指標'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                label += context.raw;
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // 在 DOMContentLoaded 時初始化圖表
    initializeChart();

    function addHistoryEntry(filename, status, analysisTime) {
        const li = document.createElement('li');
        li.textContent = `${analysisTime} - 影片: ${filename} - 狀態: ${status}`;
        historyList.prepend(li);
        if (historyList.children.length > 5) {
            historyList.removeChild(historyList.lastChild);
        }
    }

    // 處理上傳按鈕點擊事件
    uploadButton.addEventListener('click', async () => {
        const file = videoUpload.files[0];
        if (!file) {
            errorMessageDiv.textContent = '請先選擇一個影片檔案。';
            errorMessageDiv.classList.remove('hidden');
            return;
        }

        messageDiv.textContent = '影片上傳中...';
        errorMessageDiv.classList.add('hidden');
        uploadButton.disabled = true;
        
        predictionResultDisplay.textContent = '等待影片分析完成以獲取模型預測結果...';
        predictionResultDisplay.classList.remove('good-pitch', 'bad-pitch');
        
        initializeChart(); // 重設圖表數據
        currentFrameNumSpan.textContent = '0'; // 重設幀數顯示
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height); // 清空 Canvas


        const formData = new FormData();
        formData.append('file', file);

        try {
            const uploadResponse = await fetch(`${API_BASE_URL}/upload_video/`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json();
                throw new Error(errorData.detail || '影片上傳失敗');
            }

            const uploadResult = await uploadResponse.json();
            messageDiv.textContent = `影片上傳成功: ${uploadResult.filename}，開始分析...`;
            
            analysisSection.classList.remove('hidden');

            const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws/analyze_video/${uploadResult.filename}`;
            websocket = new WebSocket(wsUrl);

            websocket.onopen = () => {
                messageDiv.textContent = 'WebSocket 連線成功，正在接收分析數據...';
                stopAnalysisButton.disabled = false;
            };

            websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                // console.log("WebSocket Received:", data); // 暫時保留，用於除錯

                if (data.error) {
                    errorMessageDiv.textContent = `分析錯誤: ${data.error}`;
                    errorMessageDiv.classList.remove('hidden');
                    messageDiv.textContent = '';
                    websocket.close();
                    return;
                }

                // 接收影片元數據，用於設置 Canvas 尺寸
                if (data.video_meta) {
                    analysisCanvas.width = data.video_meta.width;
                    analysisCanvas.height = data.video_meta.height;
                    // console.log("Canvas size set to:", analysisCanvas.width, analysisCanvas.height);
                }

                // 接收圖像數據和骨架點位
                if (data.image_data) {
                    // 創建一個 Image 物件來載入 Base64 圖像
                    const img = new Image();
                    img.onload = () => {
                        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height); // 清空 Canvas
                        ctx.drawImage(img, 0, 0, analysisCanvas.width, analysisCanvas.height); // 繪製圖像
                    };
                    img.src = 'data:image/jpeg;base64,' + data.image_data; // 設置圖像源為 Base64 數據

                    // 更新幀數顯示
                    if (data.frame_num !== undefined) {
                        currentFrameNumSpan.textContent = data.frame_num;
                    }

                    // 更新指標
                    if (data.metrics) {
                        const newChartData = metricIds.map(id =>
                            data.metrics[id] !== undefined ? data.metrics[id] : 0
                        );
                        metricsChart.data.datasets[0].data = newChartData;
                        metricsChart.update();
                    }
                }
                
                // 更新模型預測結果（分析結束）
                if (data.final_predict) {
                    predictionResultDisplay.classList.remove('good-pitch', 'bad-pitch');
                    if (data.final_predict === '好球') {
                        predictionResultDisplay.textContent = '好球';
                        predictionResultDisplay.classList.add('good-pitch');
                    } else if (data.final_predict === '壞球') {
                        predictionResultDisplay.textContent = '壞球';
                        predictionResultDisplay.classList.add('bad-pitch');
                    } else {
                        predictionResultDisplay.textContent = `分析完成：${data.final_predict}`;
                    }

                    messageDiv.textContent = "分析已完成";
                    stopAnalysisButton.disabled = true;
                    uploadButton.disabled = false;
                }
            };

            websocket.onclose = () => {
                messageDiv.textContent = '分析已結束或連線斷開。';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                addHistoryEntry(uploadResult.filename, '完成', new Date().toLocaleTimeString());
            };

            websocket.onerror = (error) => {
                errorMessageDiv.textContent = `WebSocket 錯誤: ${error.message || '未知錯誤'}`;
                errorMessageDiv.classList.remove('hidden');
                messageDiv.textContent = '';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                addHistoryEntry(file.name, '失敗', new Date().toLocaleTimeString());
            };

        } catch (error) {
            errorMessageDiv.textContent = `上傳或分析失敗: ${error.message}`;
            errorMessageDiv.classList.remove('hidden');
            messageDiv.textContent = '';
            uploadButton.disabled = false;
            if (websocket) websocket.close();
            addHistoryEntry(file.name, '上傳失敗', new Date().toLocaleTimeString());
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
    });
});