// metrics_chart.js

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

let metricsChart; // Declare metricsChart in this scope

/**
 * Initializes the Chart.js instance for displaying metrics.
 * @param {HTMLCanvasElement} canvasElement The canvas element for the chart.
 */
export function initMetricsChart(canvasElement) {
    const ctx = canvasElement.getContext('2d');
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
            maintainAspectRatio: false, // 允許 canvas 不保持原始長寬比
            scales: {
                x: {
                    title: {
                        display: true,
                        text: '幀數'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '指標值'
                    },
                    beginAtZero: false // 指標值可能不是從零開始
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                },
                hover: {
                    mode: 'nearest',
                    intersect: true
                },
                title: {
                    display: true,
                    text: '各指標時間序列圖'
                }
            }
        }
    });
}

/**
 * Updates the metrics chart with new data.
 * This function is modified to accept all_metrics data (an array of metric objects for each frame)
 * instead of a single frame's metrics.
 * @param {Array<Object>} allMetrics An array of metric objects, where each object represents a frame's metrics.
 * [{frame_num: 1, stride_angle: ..., throwing_angle: ...}, ...]
 */
export function updateMetricsChart(allMetrics) {
    if (metricsChart) {
        metricsChart.data.labels = []; // 清空舊的幀數
        metricsChart.data.datasets.forEach(dataset => {
            dataset.data = []; // 清空舊的數據
        });

        // 遍歷所有幀的數據
        allMetrics.forEach((frameMetrics, index) => {
            const frameNumber = frameMetrics.frame_num || index + 1; // 使用 frame_num 或索引作為幀數
            metricsChart.data.labels.push(frameNumber);

            Object.keys(metricLabels).forEach(metricKey => {
                const dataset = metricsChart.data.datasets.find(ds => ds.label === metricLabels[metricKey]);
                if (dataset) {
                    // 檢查當前幀是否有該指標的數據
                    if (frameMetrics[metricKey] !== undefined) {
                        dataset.data.push(frameMetrics[metricKey]);
                    } else {
                        // 如果缺失，可以填充 null 來表示數據中斷
                        dataset.data.push(null);
                    }
                }
            });
        });

        metricsChart.update();
    }
}


/**
 * Resets the metrics chart to its initial empty state.
 */
export function resetMetricsChart() {
    if (metricsChart) {
        metricsChart.data.labels = [];
        metricsChart.data.datasets.forEach(dataset => {
            dataset.data = [];
        });
        metricsChart.update();
    }
}

/**
 * Generates a random hexadecimal color code.
 * @returns {string} A random color code (e.g., "#RRGGBB").
 */
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}