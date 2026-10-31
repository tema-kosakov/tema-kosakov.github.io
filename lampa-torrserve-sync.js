(function () {
    'use strict';

    /**
     * Плагин автоматической синхронизации меток "Просмотрено" из базы TorrServe Matrix в Lampa.
     * Срабатывает СРАЗУ при запуске Lampa и при каждом возврате на главный экран.
     */
    function TorrServeGlobalSyncPlugin() {
        console.log('TorrServeGlobalSyncPlugin', 'Initialized');

        // Получение URL-адреса TorrServe из настроек Lampa
        function getTorrServeUrl() {
            var ip = Lampa.Storage.field('torrserve_url') || Lampa.Storage.field('torrserve_url_native') || '127.0.0.1:8090';
            if (!/^https?:\/\//i.test(ip)) {
                ip = 'http://' + ip;
            }
            return ip.replace(/\/$/, '');
        }

        // Заголовки авторизации (если в TorrServe включен пароль)
        function getAuthHeader() {
            if (Lampa.Storage.field('torrserve_auth')) {
                var login = Lampa.Storage.field('torrserve_login') || '';
                var pass = Lampa.Storage.field('torrserve_password') || '';
                return { 'Authorization': 'Basic ' + btoa(login + ':' + pass) };
            }
            return {};
        }

        /**
         * Полный процесс синхронизации всех просмотренных торрентов
         */
        function syncAllTorrents() {
            var serverUrl = getTorrServeUrl();

            // 1. Запрашиваем историю просмотров из TorrServe (/viewed)
            $.ajax({
                url: serverUrl + '/viewed',
                type: 'POST',
                data: JSON.stringify({ action: 'list' }),
                contentType: 'application/json',
                headers: getAuthHeader(),
                timeout: 3000,
                success: function (viewedItems) {
                    if (!Array.isArray(viewedItems) || !viewedItems.length) return;

                    // 2. Запрашиваем полный список торрентов из TorrServe (/torrents), чтобы сопоставить hash -> название/карта
                    $.ajax({
                        url: serverUrl + '/torrents',
                        type: 'POST',
                        data: JSON.stringify({ action: 'list' }),
                        contentType: 'application/json',
                        headers: getAuthHeader(),
                        timeout: 3000,
                        success: function (torrentsList) {
                            if (!Array.isArray(torrentsList)) return;

                            var onlineView = Lampa.Storage.get('online_view', {}) || {};
                            var history = Lampa.Storage.get('history', []) || [];
                            var hasChanges = false;

                            // Создаем картам хэшей быструю карту
                            var torrentMap = {};
                            torrentsList.forEach(function (t) {
                                if (t.hash) torrentMap[t.hash.toLowerCase()] = t;
                            });

                            // Проходим по каждому просмотренному объекту в TorrServe
                            viewedItems.forEach(function (item) {
                                if (!item.hash) return;
                                var hashLower = item.hash.toLowerCase();
                                var torrentInfo = torrentMap[hashLower];

                                if (torrentInfo) {
                                    var fileIndex = item.file_index !== undefined ? item.file_index : 0;
                                    var cardId = torrentInfo.title || torrentInfo.poster || hashLower;

                                    var key = cardId + '_' + fileIndex;

                                    if (!onlineView[key]) {
                                        onlineView[key] = {
                                            time: 100,
                                            duration: 100,
                                            percent: 100,
                                            file: fileIndex,
                                            updated: Date.now()
                                        };
                                        hasChanges = true;
                                    }

                                    // Добавляем запись в глобальную историю просмотра Lampa
                                    var existsInHistory = history.some(function (h) {
                                        return h.hash === hashLower || h.title === torrentInfo.title;
                                    });

                                    if (!existsInHistory && torrentInfo.title) {
                                        history.unshift({
                                            title: torrentInfo.title,
                                            hash: hashLower,
                                            time: Date.now()
                                        });
                                    }
                                }
                            });

                            // 3. Сохраняем обновленные данные в локальное хранилище Lampa
                            if (hasChanges) {
                                Lampa.Storage.set('online_view', onlineView);
                                Lampa.Storage.set('history', history);
                                console.log('TorrServeGlobalSyncPlugin', 'Successfully synced viewed torrents!');
                            }
                        }
                    });
                },
                error: function (err) {
                    console.log('TorrServeGlobalSyncPlugin', 'TorrServe is offline or unreachable');
                }
            });
        }

        // --- ТОЧКИ ЗАПУСКА ---

        // 1. Запуск СРАЗУ при запуске Lampa
        syncAllTorrents();

        // 2. Повторная синхронизация при возврате на главный экран
        Lampa.Listener.follow('main', function (e) {
            if (e.type === 'render') {
                syncAllTorrents();
            }
        });

        // 3. Синхронизация при разворачивании приложения / фокусе
        window.addEventListener('focus', function () {
            syncAllTorrents();
        });
    }

    // Запуск при полной готовности Lampa
    if (window.appready) {
        TorrServeGlobalSyncPlugin();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') TorrServeGlobalSyncPlugin();
        });
    }
})();