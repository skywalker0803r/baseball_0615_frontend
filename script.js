// script.js
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
    const progressBarContainer = document.getElementById('progressBarContainer'); // New
    const progressBar = document.getElementById('progressBar'); // New
    const progressText = document.getElementById('progressText'); // New

    // Chart.js 相關元素
    const metricsChartCanvas = document.getElementById('metricsChart');
    let metricsChart;

    const modelpredictContentDiv = document.getElementById('modelpredictContent');
    const predictionResultDisplay = document.getElementById('predictionResultDisplay');
    const historyList = document.getElementById('historyList');
    const stopAnalysisButton = document.getElementById('stopAnalysisButton');

    const viewAllHistoryButton = document.getElementById('viewAllHistoryButton'); // 新增獲取按鈕

    // Playback controls (New)
    const playbackControls = document.getElementById('playbackControls');
    const playPauseButton = document.getElementById('playPauseButton');
    const frameSlider = document.getElementById('frameSlider');

    const API_BASE_URL = 'https://baseball-0615-backend.onrender.com';
    let websocket = null;
    let currentRecordId = null; // 新增變數來儲存當前的 record_id

    // Store all frames' data received from backend after full processing
    let allFramesData = { metrics: [], images: [] };
    let currentPlaybackFrame = 0;
    let playbackInterval = null; // For automatic playback

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
                    // Optional: Add a click listener to load detailed history
                    li.addEventListener('click', () => loadDetailedHistory(record.id));
                    historyList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Failed to load history:', error);
            historyList.innerHTML = '<li>載入歷史記錄失敗</li>';
        }
    }

    async function loadDetailedHistory(recordId) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/history/${recordId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const recordData = await response.json();
            
            // Populate analysis section with historical data
            analysisCanvas.width = recordData.video_width;
            analysisCanvas.height = recordData.video_height;
            predictionResultDisplay.textContent = `最終預測結果: ${recordData.final_prediction}`;
            predictionResultDisplay.className = '';
            if (recordData.final_prediction === '好球') {
                predictionResultDisplay.classList.add('good-pitch');
            } else if (recordData.final_prediction === '壞球') {
                predictionResultDisplay.classList.add('bad-pitch');
            } else {
                predictionResultDisplay.classList.add('unknown-pitch');
            }

            allFramesData.metrics = recordData.all_metrics; // Assuming backend sends parsed metrics
            // Note: History currently doesn't store images. For playback, you'd need to store processed video or image frames on the server.
            // For now, only metrics chart can be shown from history.
            allFramesData.images = []; // Clear images for historical data as they are not stored
            
            // Update metrics chart with historical data
            metricsChart.data.labels = [];
            metricsChart.data.datasets.forEach(dataset => dataset.data = []);

            allFramesData.metrics.forEach(frameData => {
                metricsChart.data.labels.push(frameData.frame_num);
                metricsChart.data.datasets.forEach(dataset => {
                    const metricKey = Object.keys(metricLabels).find(key => metricLabels[key] === dataset.label);
                    if (metricKey && frameData.metrics && frameData.metrics[metricKey] !== undefined) {
                        dataset.data.push(frameData.metrics[metricKey]);
                    } else {
                        dataset.data.push(null);
                    }
                });
            });
            metricsChart.update();

            // Hide playback controls as images are not available from history API
            playbackControls.classList.add('hidden');
            analysisSection.classList.remove('hidden');
            messageDiv.textContent = `載入歷史記錄完成: ${recordData.filename}`;

        } catch (error) {
            console.error('Failed to load detailed history:', error);
            errorMessageDiv.textContent = '載入詳細歷史記錄失敗';
            errorMessageDiv.classList.remove('hidden');
        }
    }


    // 在頁面載入時立即載入歷史記錄
    loadHistory();


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
        progressBarContainer.classList.add('hidden'); // Hide progress bar initially
        playbackControls.classList.add('hidden'); // Hide playback controls initially
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height); // Clear canvas

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
            websocket = new WebSocket(`${API_BASE_URL.replace('http', 'ws')}/ws/analyze_video/${uploadResult.filename}/${currentRecordId}`);

            analysisSection.classList.remove('hidden');
            stopAnalysisButton.disabled = false;
            predictionResultDisplay.textContent = '等待影片分析完成以獲取模型預測結果...';
            predictionResultDisplay.className = ''; // 清除舊的樣式

            websocket.onopen = () => {
                console.log('WebSocket connection opened.');
                progressBarContainer.classList.remove('hidden'); // Show progress bar when analysis starts
                progressBar.style.width = '0%';
                progressText.textContent = '0%';
            };

            websocket.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.error) {
                    errorMessageDiv.textContent = `分析錯誤: ${data.error}`;
                    errorMessageDiv.classList.remove('hidden');
                    messageDiv.textContent = '';
                    websocket.close(); // 收到錯誤立即關閉 WebSocket
                    progressBarContainer.classList.add('hidden');
                    return;
                }

                if (data.video_meta) {
                    analysisCanvas.width = data.video_meta.width;
                    analysisCanvas.height = data.video_meta.height;
                    frameSlider.max = data.video_meta.total_frames;
                    console.log(`Canvas resized to: ${analysisCanvas.width}x${analysisCanvas.height}, Total frames: ${data.video_meta.total_frames}`);
                } else if (data.progress !== undefined) {
                    // Update progress bar
                    progressBar.style.width = `${data.progress}%`;
                    progressText.textContent = `${data.progress}%`;
                    messageDiv.textContent = `分析進度: ${data.progress}% (幀數: ${data.current_frame_num})`;
                    currentFrameNumSpan.textContent = data.current_frame_num; // Still update current frame for progress display
                } else if (data.final_predict && data.all_frames_data) {
                    // All analysis data received
                    predictionResultDisplay.textContent = `最終預測結果: ${data.final_predict}`;
                    if (data.final_predict === '好球') {
                        predictionResultDisplay.classList.add('good-pitch');
                    } else if (data.final_predict === '壞球') {
                        predictionResultDisplay.classList.add('bad-pitch');
                    } else {
                        predictionResultDisplay.classList.add('unknown-pitch');
                    }
                    messageDiv.textContent = '影片分析完成。';
                    progressBarContainer.classList.add('hidden'); // Hide progress bar

                    allFramesData = data.all_frames_data; // Store all received data
                    console.log('Received all frames data:', allFramesData);

                    // Initialize playback
                    frameSlider.value = 0;
                    currentPlaybackFrame = 0;
                    playbackControls.classList.remove('hidden'); // Show playback controls
                    displayFrame(currentPlaybackFrame);
                    updateMetricsChartForPlayback(currentPlaybackFrame);
                }
            };

            websocket.onclose = (event) => {
                console.log('WebSocket connection closed:', event);
                messageDiv.textContent = '分析已結束或連線斷開。';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                progressBarContainer.classList.add('hidden'); // Hide progress bar
                stopPlayback(); // Stop playback if connection closes
                loadHistory(); // 連線關閉後重新載入歷史記錄
            };

            websocket.onerror = (error) => {
                errorMessageDiv.textContent = `WebSocket 錯誤: ${error.message || '未知錯誤'}`;
                errorMessageDiv.classList.remove('hidden');
                messageDiv.textContent = '';
                uploadButton.disabled = false;
                stopAnalysisButton.disabled = true;
                progressBarContainer.classList.add('hidden');
                stopPlayback(); // Stop playback on error
                loadHistory(); // 發生錯誤時也重新載入歷史記錄
            };

        } catch (error) {
            errorMessageDiv.textContent = `上傳或分析失敗: ${error.message}`;
            errorMessageDiv.classList.remove('hidden');
            messageDiv.textContent = '';
            uploadButton.disabled = false;
            progressBarContainer.classList.add('hidden');
            if (websocket) websocket.close();
            loadHistory(); // 上傳失敗時重新載入歷史記錄
        }
    });

    stopAnalysisButton.addEventListener('click', () => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close();
            messageDiv.textContent = '分析已手動停止。';
        }
        stopAnalysisButton.disabled = true;
        uploadButton.disabled = false;
        ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
        progressBarContainer.classList.add('hidden');
        playbackControls.classList.add('hidden'); // Hide playback controls
        stopPlayback(); // Stop playback
        loadHistory(); // 手動停止後也重新載入歷史記錄
    });

    // New playback functions
    function displayFrame(frameIndex) {
        if (allFramesData.images.length > frameIndex) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, analysisCanvas.width, analysisCanvas.height);
                ctx.drawImage(img, 0, 0, analysisCanvas.width, analysisCanvas.height);
            };
            img.src = 'data:image/jpeg;base64,' + allFramesData.images[frameIndex];
            currentFrameNumSpan.textContent = allFramesData.metrics[frameIndex].frame_num;
            updateMetricsChartForPlayback(frameIndex);
        }
    }

    function startPlayback() {
        if (playbackInterval) return; // Already playing
        playPauseButton.textContent = '暫停';
        playbackInterval = setInterval(() => {
            currentPlaybackFrame++;
            if (currentPlaybackFrame >= allFramesData.images.length) {
                currentPlaybackFrame = 0; // Loop playback
            }
            frameSlider.value = currentPlaybackFrame;
            displayFrame(currentPlaybackFrame);
        }, 1000 / 30); // Assuming 30 FPS for playback, adjust as needed
    }

    function stopPlayback() {
        clearInterval(playbackInterval);
        playbackInterval = null;
        playPauseButton.textContent = '播放';
    }

    playPauseButton.addEventListener('click', () => {
        if (playbackInterval) {
            stopPlayback();
        } else {
            startPlayback();
        }
    });

    frameSlider.addEventListener('input', (event) => {
        currentPlaybackFrame = parseInt(event.target.value);
        displayFrame(currentPlaybackFrame);
        stopPlayback(); // Stop automatic playback when slider is used
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

    function updateMetricsChartForPlayback(frameIndex) {
        if (!metricsChart || !allFramesData.metrics || allFramesData.metrics.length === 0) {
            return;
        }

        // Reset chart data
        metricsChart.data.labels = [];
        metricsChart.data.datasets.forEach(dataset => dataset.data = []);

        // Populate chart with data up to the current frame
        for (let i = 0; i <= frameIndex; i++) {
            const frameMetrics = allFramesData.metrics[i];
            if (frameMetrics) {
                metricsChart.data.labels.push(frameMetrics.frame_num);
                metricsChart.data.datasets.forEach(dataset => {
                    const metricKey = Object.keys(metricLabels).find(key => metricLabels[key] === dataset.label);
                    if (metricKey && frameMetrics.metrics && frameMetrics.metrics[metricKey] !== undefined) {
                        dataset.data.push(frameMetrics.metrics[metricKey]);
                    } else {
                        // If metric is missing for this frame, push null to maintain alignment
                        dataset.data.push(null);
                    }
                });
            }
        }

        // Limit chart display to avoid overcrowding if too many frames
        const maxDataPoints = 150; // Show recent 150 frames
        if (metricsChart.data.labels.length > maxDataPoints) {
            const startIndex = metricsChart.data.labels.length - maxDataPoints;
            metricsChart.data.labels = metricsChart.data.labels.slice(startIndex);
            metricsChart.data.datasets.forEach(dataset => {
                dataset.data = dataset.data.slice(startIndex);
            });
        }
        metricsChart.update();
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