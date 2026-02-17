export const VEHICLE_MODELS_BY_MAKE: Record<string, string[]> = {
  Toyota: ['Corolla', 'Camry', 'Hilux', 'Fortuner', 'RAV4', 'Yaris', 'Land Cruiser', 'Other'],
  Volkswagen: ['Polo', 'Golf', 'Tiguan', 'Passat', 'Amarok', 'T-Cross', 'Other'],
  Ford: ['Fiesta', 'Focus', 'Ranger', 'Everest', 'EcoSport', 'Mustang', 'Other'],
  BMW: ['1 Series', '3 Series', '5 Series', 'X1', 'X3', 'X5', 'Other'],
  'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'GLA', 'GLC', 'GLE', 'Other'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7', 'Other'],
  Nissan: ['Micra', 'Almera', 'Qashqai', 'X-Trail', 'Navara', 'NP200', 'Other'],
  Hyundai: ['i10', 'i20', 'Elantra', 'Tucson', 'Santa Fe', 'Accent', 'Other'],
  Kia: ['Picanto', 'Rio', 'Cerato', 'Sportage', 'Seltos', 'Sorento', 'Other'],
  Honda: ['Jazz', 'Civic', 'Accord', 'CR-V', 'HR-V', 'Brio', 'Other'],
  Mazda: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'BT-50', 'Other'],
  Renault: ['Kwid', 'Clio', 'Sandero', 'Duster', 'Kiger', 'Captur', 'Other'],
  Suzuki: ['Swift', 'Baleno', 'Ertiga', 'Vitara', 'Jimny', 'Celerio', 'Other'],
  Isuzu: ['D-Max', 'MU-X', 'KB', 'Other'],
  Peugeot: ['208', '2008', '3008', '5008', 'Other'],
  Volvo: ['S60', 'S90', 'XC40', 'XC60', 'XC90', 'Other'],
  Subaru: ['Impreza', 'Forester', 'Outback', 'XV', 'WRX', 'Other'],
  Mitsubishi: ['ASX', 'Outlander', 'Pajero Sport', 'Triton', 'Xpander', 'Other'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck', 'Other'],
  Other: ['Other']
};

export const VEHICLE_MAKES = Object.keys(VEHICLE_MODELS_BY_MAKE);
