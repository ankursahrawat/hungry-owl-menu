export const DEFAULT_SITE_CONFIG = {
  brandName: "Hungry Owl",
  tagline: "— The Cloud Café —",
  logoEmoji: "",
  logoImage: "",
  phone: "",
  announcement: "",
  bestsellerIds: [],   // array of item IDs marked as bestsellers
};

export const DEFAULT_MENU = {
  sections: [
    { id: "s1", name: "Hot Beverages", items: [
      { id: "i1", name: "Chai", price: 15, image: "" },
      { id: "i2", name: "Cutting Chai", price: 10, image: "" },
      { id: "i3", name: "Masala Chai", price: 20, image: "" },
      { id: "i4", name: "Hot Coffee", price: 30, image: "" },
      { id: "i5", name: "Hot Chocolate", price: 90, image: "" },
    ]},
    { id: "s2", name: "Buns", items: [
      { id: "i6", name: "Bun Maska", price: 30, image: "" },
      { id: "i7", name: "Bun Makkhan", price: 30, image: "" },
    ]},
    { id: "s3", name: "Maggi", items: [
      { id: "i8", name: "Plain Maggi", price: 35, image: "" },
      { id: "i9", name: "Veg Maggi", price: 40, image: "" },
      { id: "i10", name: "Cheese Maggi", price: 60, image: "" },
    ]},
    { id: "s4", name: "Sandwiches", items: [
      { id: "i11", name: "Potato Veggies Grilled Sandwich", price: 40, image: "" },
      { id: "i12", name: "Veg Grilled Sandwich", price: 50, image: "" },
      { id: "i13", name: "Cheese Grilled Sandwich", price: 70, image: "" },
      { id: "i14", name: "Paneer Grilled Sandwich", price: 70, image: "" },
    ]},
    { id: "s5", name: "Egg Items", items: [
      { id: "i15", name: "Plain Omelette", price: 35, image: "" },
      { id: "i16", name: "Bun Omelette", price: 40, image: "" },
      { id: "i17", name: "Bread Omelette", price: 40, image: "" },
    ]},
  ]
};
