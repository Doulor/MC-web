<?php
// 代理调用 oPanel API 获取服务器性能监控数据
require_once __DIR__ . '/admin/config.php';
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

$apiUrl = 'http://39.97.183.32:30000/open-api/monitor';

$ch = curl_init($apiUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_USERAGENT => 'MC-web-Monitor/1.0',
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($response === false || $httpCode !== 200) {
    echo json_encode([
        'success' => false,
        'message' => '查询失败: ' . ($error ?: 'HTTP ' . $httpCode)
    ]);
    exit;
}

$data = json_decode($response, true);
if (!$data) {
    echo json_encode([
        'success' => false,
        'message' => '无效的API响应'
    ]);
    exit;
}

// 包装为前端友好的格式
echo json_encode([
    'success' => true,
    'data' => $data
]);