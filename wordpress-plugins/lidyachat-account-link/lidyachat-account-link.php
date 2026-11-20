<?php
/**
 * Plugin Name: LidyaChat – WooCommerce Hesap Eşleştirme (V3)
 * Description: Kullanıcının kendi WooCommerce siparişini doğrulanmış LidyaChat hesabına tek kullanımlık kodla bağlar. Ödeme almaz, Coin yüklemez.
 * Version: 0.3.0
 * Requires Plugins: woocommerce
 * Text Domain: lidyachat-account-link
 */
if (!defined('ABSPATH')) { exit; }

/**
 * Sunucu yapılandırması (wp-config.php):
 * define('LIDYACHAT_WC_SERVICE_SECRET', 'EN_AZ_32_RASTGELE_KARAKTER');
 * define('LIDYACHAT_WC_API_BASE', 'https://erischat-api-production.up.railway.app');
 * V2 API'de WOOCOMMERCE_LINKING_ENABLED ve WOOCOMMERCE_SERVICE_SECRET
 * tanımlanana kadar özellik kapalı kalır.
 */

function lidyachat_wc_link_configured() {
    return defined('LIDYACHAT_WC_SERVICE_SECRET')
        && is_string(LIDYACHAT_WC_SERVICE_SECRET)
        && strlen(LIDYACHAT_WC_SERVICE_SECRET) >= 32
        && defined('LIDYACHAT_WC_API_BASE')
        && is_string(LIDYACHAT_WC_API_BASE)
        && str_starts_with(LIDYACHAT_WC_API_BASE, 'https://');
}

function lidyachat_wc_link_owned_order($order_id) {
    if (!function_exists('wc_get_order') || !is_user_logged_in()) { return false; }
    $order = wc_get_order(absint($order_id));
    if (!$order || (int) $order->get_customer_id() !== get_current_user_id()) { return false; }
    // Guest orders cannot be linked using an unverified email address.
    if ((int) $order->get_customer_id() <= 0) { return false; }
    return $order;
}

/** Only display on the authenticated customer's WooCommerce order detail page. */
add_action('woocommerce_order_details_after_order_table', function ($order) {
    if (!$order || !is_object($order)) { return; }
    $order = lidyachat_wc_link_owned_order($order->get_id());
    if (!$order) { return; }
    echo '<section class="lidyachat-account-link"><h3>' . esc_html__('LidyaChat hesabı', 'lidyachat-account-link') . '</h3>';
    if ($order->get_meta('_lidyachat_linked_v3', true)) {
        echo '<p>' . esc_html__('Bu sipariş bir LidyaChat hesabıyla eşleştirildi. Bu işlem ödeme veya Coin teslimatı anlamına gelmez.', 'lidyachat-account-link') . '</p>';
        echo '</section>';
        return;
    }
    if (!lidyachat_wc_link_configured()) {
        echo '<p>' . esc_html__('Hesap eşleştirme henüz kullanıma açık değil.', 'lidyachat-account-link') . '</p></section>';
        return;
    }
    $status = isset($_GET['lidyachat_link_result']) ? sanitize_key(wp_unslash($_GET['lidyachat_link_result'])) : '';
    $notices = array(
        'ok' => 'Hesap eşleştirmesi kaydedildi. Ödeme doğrulaması veya Coin teslimatı yapılmadı.',
        'invalid' => 'Kod geçersiz, kullanılmış veya süresi dolmuş. Yeni bir kod oluşturun.',
        'error' => 'Eşleştirme şu anda tamamlanamadı. Destek ekibine başvurun.'
    );
    if (isset($notices[$status])) { echo '<p role="status">' . esc_html($notices[$status]) . '</p>'; }
    echo '<p>LidyaChat uygulamasından aldığınız 5 dakikalık tek kullanımlık bağlantı kodunu girin.</p>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('lidyachat_wc_link_' . $order->get_id(), 'lidyachat_wc_nonce');
    echo '<input type="hidden" name="action" value="lidyachat_wc_pair_order">';
    echo '<input type="hidden" name="order_id" value="' . esc_attr((string) $order->get_id()) . '">';
    echo '<p><label for="lidyachat_ticket">LidyaChat bağlantı kodu</label></p>';
    echo '<p><input id="lidyachat_ticket" name="lidyachat_ticket" type="text" required minlength="32" maxlength="256" autocomplete="off" inputmode="text" style="max-width:100%;width:360px"></p>';
    echo '<p><button type="submit" class="button">Hesabı siparişe bağla</button></p>';
    echo '</form></section>';
}, 20, 1);

add_action('admin_post_lidyachat_wc_pair_order', function () {
    if (!is_user_logged_in() || !function_exists('wc_get_order')) { wp_die('Yetkisiz istek', '', array('response' => 403)); }
    $order_id = isset($_POST['order_id']) ? absint(wp_unslash($_POST['order_id'])) : 0;
    $order = lidyachat_wc_link_owned_order($order_id);
    if (!$order || !isset($_POST['lidyachat_wc_nonce']) ||
        !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['lidyachat_wc_nonce'])), 'lidyachat_wc_link_' . $order_id)) {
        wp_die('Yetkisiz sipariş', '', array('response' => 403));
    }
    $redirect = $order->get_view_order_url();
    $finish = function ($status) use ($redirect) {
        wp_safe_redirect(add_query_arg('lidyachat_link_result', $status, $redirect));
        exit;
    };
    if ($order->get_meta('_lidyachat_linked_v3', true) || !lidyachat_wc_link_configured()) { $finish('error'); }
    $ticket = isset($_POST['lidyachat_ticket']) ? trim((string) wp_unslash($_POST['lidyachat_ticket'])) : '';
    if (!preg_match('/^[A-Za-z0-9_-]{32,256}$/D', $ticket) || $order_id > 2147483647) { $finish('invalid'); }
    $api = trailingslashit(rtrim(LIDYACHAT_WC_API_BASE, '/')) . 'v1/woocommerce/pairing-redeem';
    $response = wp_remote_post($api, array(
        'timeout' => 12,
        'redirection' => 0,
        'sslverify' => true,
        'headers' => array(
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'X-LidyaChat-WooCommerce-Secret' => LIDYACHAT_WC_SERVICE_SECRET,
        ),
        'body' => wp_json_encode(array('ticket' => $ticket, 'order_id' => $order_id))
    ));
    if (is_wp_error($response)) { $finish('error'); }
    $code = wp_remote_retrieve_response_code($response);
    if ($code !== 200) { $finish(in_array($code, array(404, 409, 422), true) ? 'invalid' : 'error'); }
    $data = json_decode(wp_remote_retrieve_body($response), true);
    if (!is_array($data) || ($data['linked'] ?? null) !== true || ($data['credited'] ?? null) !== false ||
        (int) ($data['order_id'] ?? 0) !== $order_id || !is_string($data['user_id'] ?? null) ||
        strlen($data['user_id']) < 1 || strlen($data['user_id']) > 64) {
        $finish('error');
    }
    // Only store internal immutable identity. Do not log tickets, service secrets or raw response.
    $order->update_meta_data('_lidyachat_user_id_v3', $data['user_id']);
    $order->update_meta_data('_lidyachat_linked_v3', 'yes');
    $order->save();
    $finish('ok');
});
