// prediction_display.js

/**
 * Displays the final prediction result on the UI.
 * @param {string} prediction The prediction string (e.g., "好球", "壞球").
 */
export function displayPredictionResult(prediction) {
    const predictionResultDisplay = document.getElementById('predictionResultDisplay');
    if (predictionResultDisplay) {
        predictionResultDisplay.textContent = `最終預測結果: ${prediction}`;
        predictionResultDisplay.className = ''; // Clear existing styles
        if (prediction === '好球') {
            predictionResultDisplay.classList.add('good-pitch');
        } else if (prediction === '壞球') {
            predictionResultDisplay.classList.add('bad-pitch');
        } else {
            predictionResultDisplay.classList.add('unknown-pitch'); // Fallback for unknown predictions
        }
    }
}

/**
 * Resets the prediction display to its initial state.
 */
export function resetPredictionDisplay() {
    const predictionResultDisplay = document.getElementById('predictionResultDisplay');
    if (predictionResultDisplay) {
        predictionResultDisplay.textContent = '等待影片分析完成以獲取模型預測結果...';
        predictionResultDisplay.className = ''; // Clear any prediction-specific classes
    }
}