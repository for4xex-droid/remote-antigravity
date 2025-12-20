import React, { useState, useEffect, useCallback } from 'react'; import { WeatherData, WeatherState } from '../types/weather'; // 型定義をインポート
const API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY; const CITY_NAME = 'Tokyo'; // 仮で東京を設定。将来的には位置情報APIなどから取得可能
const WeatherWidget: React.FC = () => {
    const [weatherState, setWeatherState] = useState<WeatherState>({ data: null, loading: true, error: null, });
    // 天気データをフェッチする非同期関数
    const fetchWeatherData = useCallback(async () => {
        setWeatherState({ data: null, loading: true, error: null });
        if (!API_KEY) {
            console.warn("OpenWeatherMap API Key missing. Using mock data.");
            const mockData: WeatherData = {
                coord: { lon: 139.69, lat: 35.69 },
                weather: [{ id: 800, main: 'Clear', description: '快晴 (Mock)', icon: '01d' }],
                base: 'stations',
                main: {
                    temp: 22.5,
                    feels_like: 24.0,
                    temp_min: 20.0,
                    temp_max: 25.0,
                    pressure: 1012,
                    humidity: 45
                },
                visibility: 10000,
                wind: { speed: 4.1, deg: 160 },
                clouds: { all: 0 },
                dt: Math.floor(Date.now() / 1000),
                sys: {
                    type: 1,
                    id: 8074,
                    country: 'JP',
                    sunrise: Math.floor(Date.now() / 1000) - 20000,
                    sunset: Math.floor(Date.now() / 1000) + 20000
                },
                timezone: 32400,
                id: 1850147,
                name: 'Tokyo (Mock)',
                cod: 200
            };

            setTimeout(() => {
                setWeatherState({ data: mockData, loading: false, error: null });
            }, 800);
            return;
        }
        try {
            // 都市名で天気情報を検索するAPI URLを構築
            // 単位は摂氏 ('metric')、言語は日本語 ('ja') に設定
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${CITY_NAME}&appid=${API_KEY}&units=metric&lang=ja`;
            const response = await fetch(url);
            // レスポンスが正常でない場合のエラーハンドリング
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            // 正常なレスポンスをWeatherData型にパース
            const data: WeatherData = await response.json();
            setWeatherState({ data, loading: false, error: null });
        } catch (err: unknown) { // any 型から unknown 型に変更
            // データフェッチ中の例外エラーハンドリング
            let errorMessage = "天気情報の取得に失敗しました。";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'string') {
                errorMessage = err;
            } else {
                errorMessage = String(err); // その他の未知のエラーも文字列化
            }
            console.error("Failed to fetch weather data:", err);
            setWeatherState({ data: null, loading: false, error: errorMessage });
        }
    }, []); // fetchWeatherDataは依存関係がないため空配列
    // コンポーネントマウント時に天気データをフェッチ
    useEffect(() => {
        fetchWeatherData();
    }, [fetchWeatherData]); // useCallbackと組み合わせることで無限ループを回避
    const { data, loading, error } = weatherState;
    // ローディング中の表示
    if (loading) {
        return (
            <div className="p-4 bg-gray-800 rounded-lg shadow-md text-white flex items-center justify-center min-h-[150px]">
                <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>天気情報を取得中...</span>
            </div>
        );
    }
    // エラー発生時の表示
    if (error) {
        return (
            <div className="p-4 bg-red-600 rounded-lg shadow-md text-white min-h-[150px] flex flex-col justify-center items-center">
                <p className="font-bold mb-2">エラー:</p>
                <p className="text-sm text-center">{error}</p>
                <button
                    onClick={fetchWeatherData}
                    className="mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-md text-sm font-medium transition-colors"
                >
                    再試行
                </button>
            </div>
        );
    }
    // データがない場合（初期状態またはエラー後に再試行待ちの場合など）
    // あるいは、データは存在するが、重要な情報（weather配列やmainオブジェクト）が欠損している場合
    if (!data || !data.main || !data.wind || !data.weather || data.weather.length === 0) {
        return (
            <div className="p-4 bg-gray-600 rounded-lg shadow-md text-white min-h-[150px] flex flex-col justify-center items-center">
                <p className="font-bold mb-2">天気データがありません</p>
                <p className="text-sm text-center">一部の情報が取得できませんでした。</p>
                <button
                    onClick={fetchWeatherData}
                    className="mt-3 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-md text-sm font-medium transition-colors"
                >
                    再試行
                </button>
            </div>
        );
    }
    // 防御的なプロパティアクセス
    const currentWeatherData = data.weather[0]; // 既にweather.length > 0 をチェック済み
    const weatherIcon = currentWeatherData?.icon;
    const weatherDescription = currentWeatherData?.description || '天気情報なし';
    const weatherIconUrl = weatherIcon ? `https://openweathermap.org/img/wn/${weatherIcon}@2x.png` : '/next.svg'; // public/next.svgをフォールバックとして使用
    const temp = data.main?.temp;
    const feelsLike = data.main?.feels_like;
    const humidity = data.main?.humidity;
    const pressure = data.main?.pressure;
    const windSpeed = data.wind?.speed;
    const visibility = data.visibility;
    // 天気情報が正常に取得できた場合の表示
    return (
        <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-xl text-white max-w-sm mx-auto">
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold">{data.name}</h2>
                {/* 画像ロードエラー時にフォールバック画像を表示 */}
                <img
                    src={weatherIconUrl}
                    alt={weatherDescription}
                    className="w-16 h-16"
                    onError={(e) => (e.currentTarget.src = '/next.svg')} // エラー時にデフォルトアイコンを表示
                />
            </div>
            <div className="flex items-baseline mb-2">
                <p className="text-5xl font-extrabold">{temp !== undefined ? Math.round(temp) : '--'}°C</p>
                <p className="ml-2 text-lg">体感: {feelsLike !== undefined ? Math.round(feelsLike) : '--'}°C</p>
            </div>
            <p className="text-xl capitalize mb-4">{weatherDescription}</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <p>湿度: <span className="font-semibold">{humidity !== undefined ? `${humidity}%` : '--'}</span></p>
                <p>風速: <span className="font-semibold">{windSpeed !== undefined ? `${(windSpeed * 3.6).toFixed(1)} km/h` : '--'}</span></p>
                <p>気圧: <span className="font-semibold">{pressure !== undefined ? `${pressure} hPa` : '--'}</span></p>
                <p>視界: <span className="font-semibold">{visibility !== undefined ? `${(visibility / 1000).toFixed(1)} km` : '--'}</span></p>
            </div>
        </div>
    );
};
export default WeatherWidget;