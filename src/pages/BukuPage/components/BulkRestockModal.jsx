import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Modal, Form, Input, InputNumber, Button, message, Spin, Alert, Typography, Select, Space, Divider, Card, Row, Col, Statistic, DatePicker
} from 'antd';
import { ref, push, serverTimestamp, runTransaction, set } from 'firebase/database';
import { db } from '../../../api/firebase';
import { numberFormatter } from '../../../utils/formatters';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs'; // Pastikan install dayjs: npm install dayjs

const { Text } = Typography;

// --- Komponen Subtotal Display (Ringan & Cepat) ---
const SubtotalDisplay = ({ index }) => (
  <Form.Item
    noStyle
    shouldUpdate={(prev, cur) => prev.items?.[index]?.quantity !== cur.items?.[index]?.quantity}
  >
    {({ getFieldValue }) => {
      const quantity = Number(getFieldValue(['items', index, 'quantity']) || 0);
      const color = quantity > 0 ? '#52c41a' : quantity < 0 ? '#f5222d' : '#8c8c8c';
      const prefix = quantity > 0 ? '+' : '';
      return (
        <Input
          readOnly
          disabled
          value={`${prefix}${numberFormatter(quantity)}`}
          style={{
            width: '100%',
            textAlign: 'right',
            background: '#f0f2f5',
            color,
            fontWeight: 'bold',
            fontSize: '12px' // Ukuran font disesuaikan agar muat
          }}
        />
      );
    }}
  </Form.Item>
);

const BulkRestockModal = ({ open, onClose, bukuList }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [selectedBookIdsInForm, setSelectedBookIdsInForm] = useState(new Set());

  useEffect(() => {
    if (open) {
      form.resetFields();
      // Default tanggal hari ini dan 1 item kosong
      form.setFieldsValue({ 
        tanggal: dayjs(),
        items: [{}] 
      });
      setSelectedBookIdsInForm(new Set());
    }
  }, [open, form]);

  const handleFormValuesChange = useCallback((_, allValues) => {
    // Update daftar ID buku yang sudah dipilih untuk disable opsi duplikat
    const currentIds = new Set(allValues.items?.map(item => item?.bookId).filter(Boolean) || []);
    setSelectedBookIdsInForm(currentIds);
  }, []);

  // --- OPTIMASI LAG: Memoize Options ---
  // Kita buat list options sekali saja (atau saat bukuList/selected berubah)
  // daripada me-render <Option> berulang kali di dalam render loop.
  const bookOptions = useMemo(() => {
    return bukuList?.map(buku => ({
      label: `[${buku.kode_buku}] ${buku.judul} (Stok: ${buku.stok})`,
      value: buku.id,
      // Properti tambahan untuk keperluan filtering search
      searchStr: `${buku.kode_buku} ${buku.judul} ${buku.penerbit}`.toLowerCase(),
      // Disable jika sudah dipilih di row lain
      disabled: selectedBookIdsInForm.has(buku.id)
    })) || [];
  }, [bukuList, selectedBookIdsInForm]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const overallRemark = values.overallRemark || '';
      const tanggalObj = values.tanggal; // Ambil objek dayjs
      const tanggalString = tanggalObj ? tanggalObj.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      
      const items = values.items || [];
      const validItems = items.filter(
        item => item && item.bookId && item.quantity !== null && item.quantity !== undefined
      );

      if (validItems.length === 0) {
        message.warning('Tambahkan setidaknya satu item buku yang valid.');
        return;
      }
      
      const hasZeroQuantity = validItems.some(item => Number(item.quantity) === 0);
      if (hasZeroQuantity) {
        message.error('Jumlah perubahan tidak boleh 0.');
        return;
      }

      setLoading(true);

      const updatePromises = validItems.map(async (item) => {
        const bookId = item.bookId;
        const jumlahNum = Number(item.quantity);
        const specificRemark = item.specificRemark || '';
        const bukuRef = ref(db, `buku/${bookId}`);

        let keteranganGabungan = overallRemark;
        if (specificRemark) {
          keteranganGabungan = overallRemark ? `${overallRemark} (${specificRemark})` : specificRemark;
        }
        if (!keteranganGabungan) {
          keteranganGabungan = jumlahNum > 0 ? 'Stok Masuk (Borongan)' : 'Stok Keluar (Borongan)';
        }

        let historyDataForRoot = null;

        await runTransaction(bukuRef, currentData => {
          if (!currentData) return;

          const stokSebelum = Number(currentData.stok) || 0;
          const stokSesudah = stokSebelum + jumlahNum;

          historyDataForRoot = {
            bukuId: bookId,
            judul: currentData.judul,
            kode_buku: currentData.kode_buku,
            penerbit: currentData.penerbit || 'N/A',
            perubahan: jumlahNum,
            stokSebelum,
            stokSesudah,
            keterangan: "Restock "+keteranganGabungan,
            tanggal_transaksi: tanggalString, // SIMPAN TANGGAL INPUT
            timestamp: serverTimestamp() // Tetap simpan waktu server untuk sorting akurat
          };

          return {
            ...currentData,
            stok: stokSesudah,
            updatedAt: serverTimestamp()
          };
        });

        if (historyDataForRoot) {
          const newHistoryRef = push(ref(db, 'historiStok'));
          await set(newHistoryRef, historyDataForRoot);
        }
      });

      await Promise.all(updatePromises);
      message.success(`Stok berhasil diperbarui untuk ${validItems.length} buku.`);
      onClose();
    } catch (error) {
      console.error('Error:', error);
      message.error('Gagal menyimpan data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Restock Buku Borongan"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      width={1400} 
      style={{ top: 20 }}
    >
      <Spin spinning={loading} tip="Menyimpan...">
        <Form
          form={form}
          layout="vertical"
          autoComplete="off"
          onValuesChange={handleFormValuesChange}
        >
          {/* --- HEADER FORM: TANGGAL & KETERANGAN --- */}
          <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
            <Row gutter={16}>
              <Col xs={24} md={6}>
                <Form.Item 
                  name="tanggal" 
                  label="Tanggal" 
                  rules={[{ required: true, message: 'Pilih tanggal' }]}
                  style={{ marginBottom: 0 }}
                >
                  <DatePicker 
                    style={{ width: '100%' }} 
                    format="DD/MM/YYYY" 
                    allowClear={false}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={18}>
                <Form.Item 
                  name="overallRemark" 
                  label="Keterangan Umum (Opsional)"
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="Contoh: Stok Opname, Kiriman Penerbit X..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* --- LIST ITEM --- */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 4 }}>
            <Form.List name="items">
              {(fields, { add, remove }, { errors }) => (
                <>
                  {fields.map(({ key, name, ...restField }, index) => (
                    <Card
                      key={key}
                      size="small"
                      style={{
                        marginBottom: 8,
                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9',
                        borderColor: '#e8e8e8'
                      }}
                      bodyStyle={{ padding: '8px 12px' }} // Compact padding (Kantip style)
                    >
                      <Row gutter={[8, 0]} align="middle">
                        
                        {/* 1. CARI BUKU (Md=7) */}
                        <Col xs={24} md={7}>
                          <Form.Item
                            {...restField}
                            name={[name, 'bookId']}
                            style={{ marginBottom: 0 }}
                            rules={[{ required: true, message: '' }]}
                          >
                            <Select
                              showSearch
                              placeholder="Pilih Buku..."
                              style={{ width: '100%' }}
                              options={bookOptions} // Menggunakan props options (LEBIH CEPAT)
                              optionFilterProp="label"
                              filterOption={(input, option) => 
                                (option?.searchStr || '').includes(input.toLowerCase())
                              }
                            />
                          </Form.Item>
                        </Col>

                        {/* 2. QTY (Md=3 - Sempit) */}
                        <Col xs={12} md={3}>
                          <Form.Item
                            {...restField}
                            name={[name, 'quantity']}
                            style={{ marginBottom: 0 }}
                            rules={[{ required: true, message: '' }]}
                          >
                            <InputNumber 
                              placeholder="Qty" 
                              style={{ width: '100%' }} 
                            />
                          </Form.Item>
                        </Col>

                        {/* 3. HASIL (Md=3 - Sempit) */}
                        <Col xs={12} md={3}>
                           <SubtotalDisplay index={index} />
                        </Col>

                        {/* 4. KETERANGAN SPESIFIK (Md=10 - Selebar-lebarnya) */}
                        <Col xs={22} md={10}>
                          <Form.Item
                            {...restField}
                            name={[name, 'specificRemark']}
                            style={{ marginBottom: 0 }}
                          >
                            <Input placeholder="Keterangan khusus item ini..." />
                          </Form.Item>
                        </Col>

                        {/* 5. TOMBOL HAPUS (Md=1) */}
                        <Col xs={2} md={1} style={{ textAlign: 'center' }}>
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={() => remove(name)}
                          />
                        </Col>
                      </Row>
                    </Card>
                  ))}

                  <Button
                    type="dashed"
                    onClick={() => add()}
                    block
                    icon={<PlusOutlined />}
                    style={{ marginTop: 8 }}
                  >
                    Tambah Baris
                  </Button>
                </>
              )}
            </Form.List>
          </div>

          {/* --- FOOTER TOTAL --- */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
              JSON.stringify(prev.items || []) !== JSON.stringify(cur.items || [])
            }
          >
            {({ getFieldValue }) => {
              const items = getFieldValue('items') || [];
              const totalQty = items.reduce((acc, curr) => acc + (Number(curr?.quantity) || 0), 0);
              
              return (
                <div style={{ marginTop: 16, padding: '12px', background: '#f0f2f5', borderRadius: 4 }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Text type="secondary">Pastikan data sudah benar sebelum simpan.</Text>
                    </Col>
                    <Col>
                      <Space size="large">
                        <Statistic 
                          title="Total Perubahan" 
                          value={totalQty} 
                          valueStyle={{ fontSize: 18, color: totalQty >= 0 ? '#3f8600' : '#cf1322' }} 
                          prefix={totalQty > 0 ? '+' : ''}
                        />
                        <Button onClick={onClose} disabled={loading}>Batal</Button>
                        <Button type="primary" onClick={handleOk} loading={loading}>
                          Simpan Semua
                        </Button>
                      </Space>
                    </Col>
                  </Row>
                </div>
              );
            }}
          </Form.Item>
        </Form>
      </Spin>
    </Modal>
  );
};

export default BulkRestockModal;