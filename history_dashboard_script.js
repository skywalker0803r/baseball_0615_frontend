// history_dashboard_script.js
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded: history_dashboard_script.js is running.');

    const API_BASE_URL = 'https://baseball-0615-backend.onrender.com'; // 使用與主頁相同的 API 基礎 URL
    const recordSelect1 = document.getElementById('recordSelect1');
    const recordSelect2 = document.getElementById('recordSelect2');
    const compareButton = document.getElementById('compareButton');
    const dashboardMessage = document.getElementById('dashboardMessage');
    const dashboardError = document.getElementById('dashboardError');

    // These variables were commented out previously, ensuring the displayRecordDetails function directly uses IDs.
    // Ensure the corresponding HTML elements exist in history_dashboard.html.

    let chart1, chart2, combinedChart; // Chart.js 實例

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

    let allHistoryRecords = []; // 儲存所有獲取的記錄

    // 獲取所有歷史記錄並填充下拉選單的函數
    async function loadAllHistoryRecords() {
        dashboardMessage.textContent = '載入歷史記錄中...';
        dashboardError.textContent = '';
        console.log('Attempting to load all history records from:', `${API_BASE_URL}/api/history`);
        try {
            const response = await fetch(`${API_BASE_URL}/api/history`);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }
            allHistoryRecords = await response.json();
            console.log('Successfully loaded history records:', allHistoryRecords);
            
            // 根據上傳時間排序 (最新在前)
            allHistoryRecords.sort((a, b) => new Date(b.upload_time) - new Date(a.upload_time));

            populateRecordSelect(recordSelect1, allHistoryRecords);
            populateRecordSelect(recordSelect2, allHistoryRecords);
            dashboardMessage.textContent = '歷史記錄載入完成。';
        } catch (error) {
            console.error('Failed to load history records:', error);
            dashboardError.textContent = `載入歷史記錄失敗: ${error.message}`;
            dashboardMessage.textContent = '';
        }
    }

    function populateRecordSelect(selectElement, records) {
        console.log(`Populating select element: ${selectElement.id} with ${records.length} records.`);
        selectElement.innerHTML = '<option value="">-- 請選擇 --</option>'; // 預設選項
        records.forEach(record => {
            const option = document.createElement('option');
            option.value = record.id;
            option.textContent = `${record.upload_time} - ${record.filename} (${record.analysis_status}) - 預測: ${record.final_prediction}`;
            selectElement.appendChild(option);
        });
    }

    // 獲取圖表隨機顏色的函數
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // 初始化或更新 Chart.js 實例的函數
    function updateChart(chartInstance, canvasId, data, title, isCombined = false) {
        console.log(`Attempting to update chart for canvasId: ${canvasId}, title: ${title}`);
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Chart canvas with ID "${canvasId}" not found in the DOM.`);
            return null; // Return null if canvas is not found
        }
        const ctx = canvas.getContext('2d');

        // 如果圖表已存在，則銷毀它
        if (chartInstance) {
            console.log(`Destroying existing chart instance for ${canvasId}.`);
            chartInstance.destroy();
        }

        const datasets = [];
        let labels = [];

        if (isCombined) {
            // 對於綜合圖表，'data' 是一個包含 { record1_metrics, record2_metrics } 的物件
            const record1Metrics = data.record1_metrics || [];
            const record2Metrics = data.record2_metrics || [];
            console.log(`Combined chart data: Record 1 metrics count: ${record1Metrics.length}, Record 2 metrics count: ${record2Metrics.length}`);

            // 確定最長的幀數序列作為標籤
            const maxLength = Math.max(
                record1Metrics.length > 0 ? Math.max(...record1Metrics.map(f => f.frame_num)) : 0,
                record2Metrics.length > 0 ? Math.max(...record2Metrics.map(f => f.frame_num)) : 0
            );
            labels = Array.from({length: maxLength}, (_, i) => i + 1);

            Object.keys(metricLabels).forEach(key => {
                const label = metricLabels[key];
                const color1 = getRandomColor();
                const color2 = getRandomColor(); // 第二條記錄使用不同顏色

                const data1 = labels.map(frameNum => {
                    const frameData = record1Metrics.find(f => f.frame_num === frameNum);
                    return frameData && frameData.metrics[key] !== undefined ? frameData.metrics[key] : null;
                });
                const data2 = labels.map(frameNum => {
                    const frameData = record2Metrics.find(f => f.frame_num === frameNum);
                    return frameData && frameData.metrics[key] !== undefined ? frameData.metrics[key] : null;
                });

                if (record1Metrics.length > 0) {
                     datasets.push({
                        label: `${label} (紀錄 1)`,
                        data: data1,
                        borderColor: color1,
                        backgroundColor: color1,
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0
                    });
                }
                if (record2Metrics.length > 0) {
                     datasets.push({
                        label: `${label} (紀錄 2)`,
                        data: data2,
                        borderColor: color2,
                        backgroundColor: color2,
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0,
                        hidden: true // 在綜合圖表中預設隱藏，以保持清晰
                    });
                }
            });
        } else {
            // 對於單條記錄圖表，'data' 是一個幀指標的陣列
            console.log(`Single record chart data length: ${data.length}`);
            labels = data.map(frame => frame.frame_num);
            Object.keys(metricLabels).forEach(key => {
                const label = metricLabels[key];
                const color = getRandomColor();
                const metricData = data.map(frame => frame.metrics[key] !== undefined ? frame.metrics[key] : null);
                datasets.push({
                    label: label,
                    data: metricData,
                    borderColor: color,
                    backgroundColor: color,
                    fill: false,
                    tension: 0.1, // 平滑曲線
                    pointRadius: 0 // 不顯示點，使線條更整潔
                });
            });
        }
        
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels, // 幀數
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title
                    },
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
                },
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
                }
            }
        });

        // 儲存新的圖表實例
        if (canvasId === 'metricsChart1') chart1 = chartInstance;
        else if (canvasId === 'metricsChart2') chart2 = chartInstance;
        else if (canvasId === 'combinedMetricsChart') combinedChart = chartInstance;
        console.log(`Chart instance for ${canvasId} updated successfully.`);
        return chartInstance; // Return the new instance
    }

    // 顯示記錄詳細資訊的函數
    function displayRecordDetails(record, spanSuffix) {
        console.log(`Displaying record details for suffix: '${spanSuffix}'. Record data:`, record);

        const elementsToUpdate = [
            { id: `filename${spanSuffix}`, value: record.filename },
            { id: `uploadTime${spanSuffix}`, value: record.upload_time },
            { id: `status${spanSuffix}`, value: record.analysis_status },
            { id: `prediction${spanSuffix}`, value: record.final_prediction, isPrediction: true },
            { id: `duration${spanSuffix}`, value: record.analysis_duration_seconds.toFixed(2) }
        ];

        elementsToUpdate.forEach(item => {
            const element = document.getElementById(item.id);
            if (element) {
                element.textContent = item.value;
                if (item.isPrediction) {
                    element.className = ''; // 清除現有樣式
                    if (item.value === '好球') {
                        element.classList.add('good-pitch');
                    } else if (item.value === '壞球') {
                        element.classList.add('bad-pitch');
                    } else {
                        element.classList.add('unknown-pitch');
                    }
                }
                console.log(`Updated element ID: ${item.id} with value: ${item.value}`);
            } else {
                console.error(`Element with ID "${item.id}" not found in the DOM.`);
                // This is the source of your TypeError. If this logs, the HTML is missing the element.
            }
        });
    }

    // 比較按鈕的事件監聽器
    compareButton.addEventListener('click', async () => {
        const recordId1 = recordSelect1.value;
        const recordId2 = recordSelect2.value;
        console.log(`Compare button clicked. Record 1 ID: ${recordId1}, Record 2 ID: ${recordId2}`);

        if (!recordId1 && !recordId2) {
            dashboardError.textContent = '請至少選擇一條紀錄進行顯示。';
            console.warn('No records selected for comparison.');
            return;
        }

        dashboardMessage.textContent = '正在載入選定的紀錄資料...';
        dashboardError.textContent = '';

        try {
            let record1Data = null;
            let record2Data = null;

            // 處理紀錄 1
            if (recordId1) {
                console.log(`Fetching details for Record 1 (ID: ${recordId1}).`);
                const response1 = await fetch(`${API_BASE_URL}/api/history/${recordId1}`);
                if (!response1.ok) {
                    const errorText = await response1.text();
                    throw new Error(`無法載入紀錄 1 (ID: ${recordId1}). HTTP status: ${response1.status}, Error: ${errorText}`);
                }
                record1Data = await response1.json();
                console.log('Record 1 data fetched successfully:', record1Data);
                // --- 重要修正: 將空字串 '' 改為 '1' ---
                displayRecordDetails(record1Data, '1'); 
                chart1 = updateChart(chart1, 'metricsChart1', record1Data.all_metrics, '紀錄 1 各指標時間序列圖');
            } else {
                console.log('Record 1 not selected. Clearing display for Record 1.');
                // 如果未選擇紀錄 1，則清除顯示並銷毀圖表
                // --- 重要修正: 將空字串 '' 改為 '1' ---
                displayRecordDetails({
                    filename: 'N/A', upload_time: 'N/A', analysis_status: 'N/A',
                    final_prediction: 'N/A', analysis_duration_seconds: 0
                }, '1');
                if (chart1) chart1.destroy();
                chart1 = null;
            }

            // 處理紀錄 2
            if (recordId2) {
                console.log(`Fetching details for Record 2 (ID: ${recordId2}).`);
                const response2 = await fetch(`${API_BASE_URL}/api/history/${recordId2}`);
                if (!response2.ok) {
                    const errorText = await response2.text();
                    throw new Error(`無法載入紀錄 2 (ID: ${recordId2}). HTTP status: ${response2.status}, Error: ${errorText}`);
                }
                record2Data = await response2.json();
                console.log('Record 2 data fetched successfully:', record2Data);
                displayRecordDetails(record2Data, '2'); // 比較記錄，後綴為 '2'
                chart2 = updateChart(chart2, 'metricsChart2', record2Data.all_metrics, '紀錄 2 各指標時間序列圖');
            } else {
                console.log('Record 2 not selected. Clearing display for Record 2.');
                 // 如果未選擇紀錄 2，則清除顯示並銷毀圖表
                 displayRecordDetails({
                    filename: 'N/A', upload_time: 'N/A', analysis_status: 'N/A',
                    final_prediction: 'N/A', analysis_duration_seconds: 0
                }, '2');
                if (chart2) chart2.destroy();
                chart2 = null;
            }

            // 更新綜合圖表（如果至少選擇了一條記錄）
            if (record1Data || record2Data) {
                console.log('Updating combined chart.');
                combinedChart = updateChart(
                    combinedChart,
                    'combinedMetricsChart',
                    { record1_metrics: record1Data ? record1Data.all_metrics : [], record2_metrics: record2Data ? record2Data.all_metrics : [] },
                    '選定紀錄綜合指標比較',
                    true
                );
            } else {
                console.log('No records selected for combined chart. Destroying if exists.');
                if (combinedChart) combinedChart.destroy();
                combinedChart = null;
            }

            dashboardMessage.textContent = '紀錄載入並顯示完成。';
            console.log('Comparison complete.');

        } catch (error) {
            console.error('Failed to fetch record details during comparison:', error);
            dashboardError.textContent = `載入詳細紀錄失敗: ${error.message}`;
            dashboardMessage.textContent = '';
        }
    });

    // Event listeners for dropdowns to immediately display selected record details
    recordSelect1.addEventListener('change', async () => {
        const selectedId = recordSelect1.value;
        console.log(`Record Select 1 changed to ID: ${selectedId}`);
        if (selectedId) {
            dashboardMessage.textContent = '正在載入紀錄 1 資料...';
            dashboardError.textContent = '';
            try {
                const response = await fetch(`${API_BASE_URL}/api/history/${selectedId}`);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`無法載入紀錄 1 (ID: ${selectedId}). HTTP status: ${response.status}, Error: ${errorText}`);
                }
                const recordData = await response.json();
                console.log('Record 1 data loaded:', recordData);
                // --- 重要修正: 將空字串 '' 改為 '1' ---
                displayRecordDetails(recordData, '1');
                chart1 = updateChart(chart1, 'metricsChart1', recordData.all_metrics, '紀錄 1 各指標時間序列圖');
                dashboardMessage.textContent = '紀錄 1 載入完成。';
            } catch (error) {
                console.error('Failed to load Record 1 details:', error);
                dashboardError.textContent = `載入紀錄 1 失敗: ${error.message}`;
                dashboardMessage.textContent = '';
            }
        } else {
            console.log('Record 1 selection cleared.');
            // --- 重要修正: 將空字串 '' 改為 '1' ---
            displayRecordDetails({
                filename: 'N/A', upload_time: 'N/A', analysis_status: 'N/A',
                final_prediction: 'N/A', analysis_duration_seconds: 0
            }, '1');
            if (chart1) chart1.destroy();
            chart1 = null;
        }
    });

    recordSelect2.addEventListener('change', async () => {
        const selectedId = recordSelect2.value;
        console.log(`Record Select 2 changed to ID: ${selectedId}`);
        if (selectedId) {
            dashboardMessage.textContent = '正在載入紀錄 2 資料...';
            dashboardError.textContent = '';
            try {
                const response = await fetch(`${API_BASE_URL}/api/history/${selectedId}`);
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`無法載入紀錄 2 (ID: ${selectedId}). HTTP status: ${response.status}, Error: ${errorText}`);
                }
                const recordData = await response.json();
                console.log('Record 2 data loaded:', recordData);
                displayRecordDetails(recordData, '2');
                chart2 = updateChart(chart2, 'metricsChart2', recordData.all_metrics, '紀錄 2 各指標時間序列圖');
                dashboardMessage.textContent = '紀錄 2 載入完成。';
            } catch (error) {
                console.error('Failed to load Record 2 details:', error);
                dashboardError.textContent = `載入紀錄 2 失敗: ${error.message}`;
                dashboardMessage.textContent = '';
            }
        } else {
            console.log('Record 2 selection cleared.');
            displayRecordDetails({
                filename: 'N/A', upload_time: 'N/A', analysis_status: 'N/A',
                final_prediction: 'N/A', analysis_duration_seconds: 0
            }, '2');
            if (chart2) chart2.destroy();
            chart2 = null;
        }
    });

    // 頁面載入時，首先載入所有歷史記錄
    loadAllHistoryRecords();
});